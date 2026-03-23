const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const os = require("os");

// 获取 Skill 根目录（scripts 目录的上级目录）
const SKILL_ROOT = path.join(__dirname, "..");

// 配置文件路径（使用相对路径）
const configPath = path.join(SKILL_ROOT, "auth.json");
const urlConfigPath = path.join(SKILL_ROOT, "zlibraryUrl.json");

// 下载目录（使用系统临时目录，跨平台兼容）
const saveDir = path.join(os.tmpdir(), "kindle_downloads");
const stateFile = path.join(saveDir, "workflow_state.json");
const browserStateFile = path.join(saveDir, "browser_state.json");

if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

let config = {};
let urls = [];

try {
  config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
} catch (e) {
  console.error("ERROR: 无法读取 auth.json: " + e.message);
  process.exit(1);
}

try {
  urls = JSON.parse(fs.readFileSync(urlConfigPath, "utf-8"));
} catch (e) {
  console.error("ERROR: 无法读取 zlibraryUrl.json: " + e.message);
  process.exit(1);
}

if (!Array.isArray(urls) || urls.length === 0) {
  console.error("ERROR: zlibraryUrl.json 内容有误或为空");
  process.exit(1);
}

const bookName = process.argv[2];
if (!bookName) {
  console.error("ERROR: MISSING_BOOK_NAME");
  process.exit(1);
}

let filters = {};
try {
  if (process.argv[3]) {
    let rawFilters = process.argv[3].trim();
    if (rawFilters.startsWith("{") && rawFilters.endsWith("}")) {
      const processed = rawFilters
        .replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, "$1\"$2\":")
        .replace(/:\s*([^"{}\[\],]+)([,}])?/g, (match, p1, p2) => {
          return ":\"" + p1.trim() + "\"" + (p2 || "");
        });
      try {
        filters = JSON.parse(processed);
      } catch(e) {
        filters = JSON.parse(rawFilters);
      }
    } else {
      filters = JSON.parse(rawFilters);
    }
  }
} catch(e) {}

// 检查是否有保存的状态（用于用户选择后继续）
let savedState = null;
if (fs.existsSync(stateFile)) {
  try {
    savedState = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    if (savedState.bookName !== bookName) {
      savedState = null;
      fs.unlinkSync(stateFile);
      if (fs.existsSync(browserStateFile)) fs.unlinkSync(browserStateFile);
    }
  } catch(e) {
    savedState = null;
  }
}

// 浏览器启动配置（自动检测 Chromium）
async function getBrowserConfig() {
  const browserArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"];
  
  // 代理配置（从 auth.json 读取，如果没有则不使用代理）
  const browserConfig = {
    args: browserArgs,
    headless: true
  };
  
  // 如果配置了代理，则使用代理
  if (config.proxy_server) {
    browserConfig.proxy = { server: config.proxy_server };
  }
  
  // 尝试自动检测 Chromium 路径
  const possiblePaths = [
    // Linux
    path.join(os.homedir(), ".cache/ms-playwright/chromium-1208/chrome-linux/chrome"),
    path.join(os.homedir(), ".cache/ms-playwright/chromium-1169/chrome-linux/chrome"),
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    // macOS
    path.join(os.homedir(), "Library/Caches/ms-playwright/chromium-1208/chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    // Windows
    path.join(process.env.LOCALAPPDATA || "", "ms-playwright/chromium-1208/chrome-win/chrome.exe"),
    path.join(process.env.PROGRAMFILES || "", "Google/Chrome/Application/chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google/Chrome/Application/chrome.exe"),
  ];
  
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      browserConfig.executablePath = p;
      break;
    }
  }
  
  return browserConfig;
}

async function run() {
  const browserConfig = await getBrowserConfig();
  const browser = await chromium.launch(browserConfig);

  // 如果有保存的浏览器状态，使用它
  let context;
  if (savedState && fs.existsSync(browserStateFile)) {
    try {
      context = await browser.newContext({
        storageState: browserStateFile,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      });
      console.log("LOG: 恢复之前的浏览器登录态...");
    } catch(e) {
      context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      });
    }
  } else {
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    });
  }

  const page = await context.newPage();

  try {
    let baseUrl = savedState?.baseUrl || "";

    if (!baseUrl) {
      for (const url of urls) {
        try {
          console.log("LOG: 尝试访问 " + url);
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.waitForTimeout(5000);
          const title = await page.title();
          if (title && !title.includes("Checking your browser")) {
            console.log("LOG: 成功进入站点: " + page.url());
            baseUrl = page.url().split("/s/")[0].split("/book/")[0];
            if (!baseUrl.endsWith("/")) baseUrl += "/";
            break;
          }
        } catch (e) {}
      }
    }

    if (!baseUrl) throw new Error("ALL_MIRRORS_UNAVAILABLE");

    const checkLogin = async () => {
      return await page.evaluate(() => {
        return !!document.querySelector(".userAccount, a[href*=\"/profile/\"], .profile-link");
      });
    };

    // 如果没有保存的状态或没有恢复登录态，需要重新登录
    if (!savedState || !fs.existsSync(browserStateFile)) {
      if (!(await checkLogin())) {
        const loginBtn = await page.$("a[href*=\"login\"], .login-btn, a:has-text(\"登录\"), a:has-text(\"Log In\")");
        if (loginBtn) {
          await loginBtn.click();
          await page.waitForSelector("#zlibrary-modal-auth input[name=\"email\"]", { timeout: 15000 });
          await page.fill("#zlibrary-modal-auth input[name=\"email\"]", config.library_account_email);
          await page.fill("#zlibrary-modal-auth input[name=\"password\"]", config.library_password);
          await page.click("#zlibrary-modal-auth button[type=\"submit\"]");
          await page.waitForTimeout(10000);
        }
      }
    }
    console.log("PROGRESS: 第一步登录已完成。");

    // 保存浏览器登录态
    await context.storageState({ path: browserStateFile });
    console.log("LOG: 浏览器登录态已保存");

    let results = savedState?.results || [];

    if (!savedState) {
      console.log("LOG: 搜索书籍: " + bookName);
      await page.goto(baseUrl + "s/" + encodeURIComponent(bookName), { waitUntil: "networkidle" });
      await page.waitForSelector("z-bookcard, .book-item, .resItemBox", { timeout: 20000 });

      const searchResultImg = path.join(saveDir, "last_search_result.png");
      await page.screenshot({ path: searchResultImg, fullPage: true });
      console.log("LOG: 搜索结果截图已保存至 " + searchResultImg);

      results = await page.evaluate(({f, searchTitle}) => {
        const items = Array.from(document.querySelectorAll("z-bookcard, .book-item, .resItemBox, div[class*=\"resItemBox\"]"));
        return items.map(el => {
          let href, rating, publisher, language, author, titleText;
          if (el.tagName.toLowerCase() === "z-bookcard") {
            href = el.getAttribute("href");
            rating = parseFloat(el.getAttribute("rating")) || 0;
            publisher = el.getAttribute("publisher") || "";
            language = el.getAttribute("language") || "";
            titleText = el.getAttribute("title") || el.querySelector("div[slot=\"title\"]")?.innerText || el.querySelector("h3")?.innerText || "";
            author = el.getAttribute("author") || el.getAttribute("authors") || el.querySelector("div[slot=\"author\"]")?.innerText || el.querySelector("a[href*=\"/author/\"]")?.innerText || "";
          } else {
            const a = el.querySelector("a[href*=\"/book/\"]");
            href = a?.getAttribute("href");
            titleText = a?.innerText || "";
            const rEl = el.querySelector(".stars, .rating, [rating]");
            rating = parseFloat(rEl?.innerText || rEl?.getAttribute("rating")) || 0;
            const pEl = el.querySelector(".publisher, [publisher]");
            publisher = pEl?.innerText || pEl?.getAttribute("publisher") || "";
            const lEl = el.querySelector(".language, [language]");
            language = lEl?.innerText || lEl?.getAttribute("language") || "";
            const authEl = el.querySelector(".authors, a[href*=\"/author/\"], [author]");
            author = authEl?.innerText || authEl?.getAttribute("author") || authEl?.getAttribute("authors") || "";
          }
          return { href, rating, publisher, language, author, titleText };
        }).filter(i => i.href);
      }, {f: filters, searchTitle: bookName});
    }

    let filtered = results.filter(i => i.titleText.toLowerCase().includes(bookName.toLowerCase()));

    if (filters.author) {
      filtered = filtered.filter(i => i.author && i.author.toLowerCase().includes(filters.author.toLowerCase()));
    }
    if (filters.publisher) {
      filtered = filtered.filter(i => i.publisher && i.publisher.toLowerCase().includes(filters.publisher.toLowerCase()));
    }
    if (filters.language) {
      filtered = filtered.filter(i => i.language && i.language.toLowerCase().includes(filters.language.toLowerCase()));
    }

    // 检查是否需要用户选择
    const hasAuthor = !!filters.author;
    const hasPublisher = !!filters.publisher;

    if (!hasAuthor && !hasPublisher && filtered.length > 1) {
      const uniqueAuthors = [...new Set(filtered.map(i => i.author).filter(a => a))];
      const uniquePublishers = [...new Set(filtered.map(i => i.publisher).filter(p => p))];

      if (uniqueAuthors.length > 1 || uniquePublishers.length > 1) {
        console.log("NEED_SELECTION: 搜索结果包含多个不同的作者或出版社，请选择。");
        console.log("LOG: 唯一作者列表: " + uniqueAuthors.join(", "));
        console.log("LOG: 唯一出版社列表: " + uniquePublishers.join(", "));
        console.log("PROGRESS: 第二步查找书籍已完成。");
        console.log("SCREENSHOT_SENT: 请查看截图并告诉我您选择的作者或出版社。");

        // 保存状态
        const state = {
          bookName,
          baseUrl,
          results,
          browserStateFile: browserStateFile,
          timestamp: Date.now()
        };
        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
        console.log("LOG: 已保存浏览器登录态和搜索状态");
        console.log("SAVE_DIR:" + saveDir);

        console.log("SEARCH_RESULTS_JSON:" + JSON.stringify(filtered.slice(0, 10).map(r => ({
          title: r.titleText,
          author: r.author,
          publisher: r.publisher,
          rating: r.rating
        }))));

        await browser.close();
        return;
      }
    }

    if (filtered.length === 0) {
      if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);
      if (fs.existsSync(browserStateFile)) fs.unlinkSync(browserStateFile);
      throw new Error("NO_MATCHING_BOOK");
    }

    // 清理状态文件
    if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);

    filtered.sort((a, b) => b.rating - a.rating);
    const bestBook = filtered[0];
    console.log("LOG: 选中书籍: " + bestBook.titleText + " (Author: " + bestBook.author + ", Publisher: " + bestBook.publisher + ")");
    console.log("PROGRESS: 第二步查找书籍已完成。");

    const detailUrl = (bestBook.href.startsWith("http") ? bestBook.href : (baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl) + bestBook.href);

    if (savedState) {
      await page.goto(baseUrl + "s/" + encodeURIComponent(bookName), { waitUntil: "networkidle" });
    }

    await page.goto(detailUrl, { waitUntil: "networkidle" });

    const detailPageImg = path.join(saveDir, "detail_page.png");
    await page.screenshot({ path: detailPageImg, fullPage: true });

    const mainDlBtn = await page.waitForSelector("a[href*=\"/dl/\"], .addDownloadedBook, .download-button", { timeout: 30000 });
    const btnText = await mainDlBtn.innerText();
    let targetDownloadUrl = null;

    if (btnText.toUpperCase().includes("EPUB")) {
      targetDownloadUrl = await mainDlBtn.getAttribute("href");
    } else {
      const dropdownToggle = await page.$(".dropdown-toggle, .btn-group .dropdown-toggle, .other-formats-btn");
      if (dropdownToggle) {
        await dropdownToggle.click();
        await page.waitForSelector(".dropdown-menu a", { timeout: 5000 });
        const epubLink = await page.$(".dropdown-menu a:has-text(\"EPUB\"), .dropdown-menu a[href*=\"epub\"]");
        if (epubLink) {
          targetDownloadUrl = await epubLink.getAttribute("href");
        } else {
          const pdfLink = await page.$(".dropdown-menu a:has-text(\"PDF\"), .dropdown-menu a[href*=\"pdf\"]");
          if (pdfLink) {
            targetDownloadUrl = await pdfLink.getAttribute("href");
          }
        }
      }
    }

    if (!targetDownloadUrl) {
      targetDownloadUrl = await mainDlBtn.getAttribute("href");
    }

    console.log("LOG: 开始下载: " + targetDownloadUrl);

    const [ download ] = await Promise.all([
      page.waitForEvent("download", { timeout: 120000 }),
      page.goto(baseUrl + targetDownloadUrl.replace(/^\//, ""))
    ]).catch(async e => {
      return await Promise.all([
        page.waitForEvent("download", { timeout: 120000 }),
        mainDlBtn.click()
      ]);
    });

    let finalFilename = download.suggestedFilename();
    const savePath = path.join(saveDir, finalFilename);
    await download.saveAs(savePath);
    console.log("SUCCESS_FILE_PATH:" + savePath);
    console.log("PROGRESS: 第三步下载书籍已完成。");

    // 清理浏览器状态文件
    if (fs.existsSync(browserStateFile)) fs.unlinkSync(browserStateFile);

  } catch (e) {
    console.error("ERROR: " + e.message);
    if (e.message !== "MISSING_BOOK_NAME") {
      const errorImg = path.join(saveDir, "last_error.png");
      try {
        await page.screenshot({ path: errorImg, fullPage: true });
        console.log("LOG: 错误截图已保存至 " + errorImg);
      } catch(se) {}
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();

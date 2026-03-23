---
name: kindle-download
description: >
  专门用于为 Kindle 下载和推送电子书的工具。
  支持按书名、作者、出版社或语言进行精准搜索。
  适用于"帮我给 kindle 下载电子书 XXX"、"kindle 下载 XXX，作者 XXX"等指令。
  注意：本技能仅限文字类电子书，若用户要求下载"漫画"，请勿使用此技能。
---

# Kindle Download Skill (STRICT MODE)

## <instructions>

**!!! 严禁向用户索要链接，严禁虚报进度，必须通过脚本下载真实内容 !!!**

**!!! 严禁在脚本报错 ERROR: NO_MATCHING_BOOK 时使用之前的下载记录或猜测结果，必须如实告知"没有找到" !!!**

### 执行流程：

#### 步骤一：执行搜索脚本

运行命令（使用相对路径，跨平台兼容）：
`node ~/.openclaw/workspace/skills/kindle-download/scripts/workflow.js "[书名]" '{"author": "[作者]", "publisher": "[出版社]"}'`

- 如果用户没有提供作者或出版社，JSON 参数填空字符串
- 例如：只提供书名时，用 `'{}'`
- 例如：提供出版社时，用 `'{"publisher": "机械工业出版社"}'`

**注意**：如果提示找不到 node 命令，请使用完整路径：
`/usr/bin/node ~/.openclaw/workspace/skills/kindle-download/scripts/workflow.js "[书名]" '{}'`

#### 步骤二：解析脚本输出

**必须实时关注并解析脚本输出的每一行：**

1. **进度报告**：看到 `PROGRESS:` 开头的行，立即向用户转述。例如：
   - `PROGRESS: 第一步登录已完成。` → 回复："第一步登录已完成。"
   - `PROGRESS: 第二步查找书籍已完成。` → 回复："第二步查找书籍已完成。"
   - `PROGRESS: 第三步下载书籍已完成。` → 回复："第三步下载书籍已完成。"

2. **保存目录**：脚本会输出 `SAVE_DIR:[路径]`，记录下载文件的保存位置。

3. **需要用户选择**：看到 `NEED_SELECTION:` 或 `SCREENSHOT_SENT:` 时：
   - **必须发送截图**：`<qqimg>[SAVE_DIR路径]/last_search_result.png</qqimg>`
   - **必须告诉用户**："搜索结果包含多个不同的作者或出版社，请查看截图并告诉我您选择的作者或出版社。"
   - **停止执行**，等待用户回复
   - 用户回复后，用用户选择的条件重新运行脚本

4. **下载成功**：看到 `SUCCESS_FILE_PATH:[路径]` 时：
   - 进入步骤三发送邮件

5. **未找到书籍**：看到 `ERROR: NO_MATCHING_BOOK` 时：
   - 告知用户："没有找到符合要求的书籍。"
   - **必须发送截图**：`<qqimg>[SAVE_DIR路径]/last_search_result.png</qqimg>`

6. **其他错误**：看到其他 `ERROR:` 时：
   - 告知用户错误信息
   - 发送截图：`<qqimg>[SAVE_DIR路径]/last_error.png</qqimg>`

#### 步骤三：发送到 Kindle

运行命令：
`python3 ~/.openclaw/workspace/skills/kindle-download/scripts/send_kindle.py "[步骤一获取的文件路径]"`

看到 `SUCCESS: Email sent...` 后，回复用户："第四步发送已完成。已发送"

## 注意事项

- **严禁**在没有获取到 `SUCCESS_FILE_PATH` 的情况下报告下载成功
- **严禁**在用户未选择时猜测或随意选择作者/出版社
- 每个进度必须**立即**报告，不要等脚本执行完毕才一次性报告
- 脚本会自动检测系统临时目录作为下载位置，跨平台兼容

</instructions>

## <available_resources>
- `scripts/workflow.js`: 搜索和下载脚本
- `scripts/send_kindle.py`: 邮件发送脚本
- `zlibraryUrl.json`: Z-Library 镜像列表
- `auth.json`: 账号授权信息
- `[系统临时目录]/kindle_downloads/`: 下载文件和截图保存位置

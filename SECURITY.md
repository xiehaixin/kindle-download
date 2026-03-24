# 安全说明文档

本文档说明 kindle-download skill 的安全架构和凭证管理建议。

## 已实现的安全措施

### 1. 输入验证（Shell 注入防护）

**位置**: `scripts/sanitize.js`

**功能**:
- 过滤所有危险的 shell 字符（; |  ` ${} > < !! 等）
- 移除控制字符（空字节、换行符等）
- 限制输入长度（书名最大 100 字符，作者/出版社最大 50 字符）
- 只允许安全字符：中文、英文、数字、空格、基本标点

**使用方式**:
```javascript
const sanitize = require('./sanitize');

// 验证书名
const result = sanitize.validateBookTitle(userInput);
if (!result.valid) {
    console.error('Invalid input:', result.error);
}
```

### 2. 文件路径验证（路径遍历防护）

**位置**: 
- `scripts/sanitize.js` (JavaScript 版本)
- `scripts/send_kindle.py` (Python 版本)

**功能**:
- 检测路径遍历攻击（../ 等）
- 只允许访问指定的安全目录
- 只接受安全的文件扩展名（.epub, .pdf, .mobi, .azw3）

**允许的目录**:
- `/tmp/kindle_downloads/`
- `~/.config/kindle-download/`

### 3. 进程隔离

- 使用独立的脚本执行，而非直接在 shell 中构建命令
- 所有参数通过脚本内部处理，不依赖 shell 解析
- 使用 Node.js 和 Python 的安全 API 进行操作

## 凭证安全建议

### 当前状态

配置文件 `auth.json` 包含以下敏感信息：
- SMTP 邮箱授权码
- Z-Library 账户密码

### 推荐的安全实践

#### 选项 1: 环境变量（推荐）

使用环境变量存储敏感信息：

```bash
# 在 ~/.bashrc 或 ~/.zshrc 中设置
export KINDLE_SMTP_EMAIL="your_email@163.com"
export KINDLE_SMTP_AUTH_CODE="your_auth_code"
export KINDLE_ZLIB_EMAIL="your_zlib_email"
export KINDLE_ZLIB_PASSWORD="your_zlib_password"
export KINDLE_RECEIVER_EMAIL="your_kindle@kindle.com"
```

然后修改 `auth.json` 使用环境变量占位符（需要修改脚本支持）。

#### 选项 2: 文件权限限制

```bash
# 设置严格的文件权限
chmod 600 ~/.config/kindle-download/auth.json

# 确保目录权限正确
chmod 700 ~/.config/kindle-download
```

#### 选项 3: 使用密钥管理工具

考虑使用系统密钥管理工具：
- macOS: Keychain
- Linux: libsecret / gnome-keyring
- 跨平台: 1Password CLI, pass

### 不要做的事情

1. **不要**将 `auth.json` 提交到版本控制系统
2. **不要**在日志中打印凭证信息
3. **不要**在公共场所或共享电脑上存储明文凭证
4. **不要**使用与重要账户相同的密码

## 安全检查清单

- [x] 输入验证已实现
- [x] 路径遍历防护已实现  
- [x] 文件类型限制已实现
- [x] 目录访问限制已实现
- [x] 进程隔离已实现
- [ ] 文件权限已设置为 600（建议用户手动执行）
- [ ] 环境变量配置（可选，需要修改脚本）
- [ ] 密钥管理集成（可选，未来增强）

## 报告安全问题

如果您发现安全漏洞，请负责任地报告。

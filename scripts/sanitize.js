/**
 * 输入验证和清理模块
 * 用于防止 Shell 注入攻击
 */

/**
 * 危险字符和模式列表
 */
const DANGEROUS_PATTERNS = [
  /;/,                  // 命令分隔符
  /\|/,                 // 管道
  /$\(/,               // 命令替换 $(...)
  /`/,                 // 命令替换 `...`
  /$\{/,               // 变量扩展 ${...}
  />/,                  // 输出重定向
  /</,                  // 输入重定向
  /\!\!/,               // 历史扩展
  /\n/,                 // 换行符
  /\r/,                 // 回车符
  /\x00/,               // 空字节
];

/**
 * 清理字符串，移除危险的 shell 字符
 * @param {string} input - 原始输入
 * @param {number} maxLength - 最大长度限制
 * @returns {string} - 清理后的字符串
 */
function sanitizeString(input, maxLength = 200) {
  if (typeof input !== 'string') {
    return '';
  }
  
  // 限制长度
  let sanitized = input.slice(0, maxLength);
  
  // 移除控制字符（保留基本空格）
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // 移除危险模式
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  // 只保留安全字符：中文、英文、数字、空格、基本标点
  // 注意：这里的正则表达式用于验证，实际的危险字符已被移除
  sanitized = sanitized.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s\-_,.。·、：:（）()]/g, '');
  
  return sanitized.trim();
}

/**
 * 验证书名格式
 * @param {string} title - 书名
 * @returns {{valid: boolean, sanitized: string, error?: string}}
 */
function validateBookTitle(title) {
  if (!title || typeof title !== 'string') {
    return { valid: false, sanitized: '', error: '书名不能为空' };
  }
  
  const sanitized = sanitizeString(title, 100);
  
  if (sanitized.length === 0) {
    return { valid: false, sanitized: '', error: '书名包含非法字符' };
  }
  
  if (sanitized.length < 1) {
    return { valid: false, sanitized: '', error: '书名太短' };
  }
  
  return { valid: true, sanitized };
}

/**
 * 验证作者/出版社名称
 * @param {string} name - 名称
 * @returns {{valid: boolean, sanitized: string, error?: string}}
 */
function validateName(name) {
  if (!name) {
    return { valid: true, sanitized: '' };
  }
  
  if (typeof name !== 'string') {
    return { valid: false, sanitized: '', error: '名称格式错误' };
  }
  
  const sanitized = sanitizeString(name, 50);
  
  return { valid: true, sanitized };
}

/**
 * 验证过滤器对象
 * @param {object} filters - 过滤器
 * @returns {{valid: boolean, sanitized: object, errors: string[]}}
 */
function validateFilters(filters) {
  const result = { valid: true, sanitized: {}, errors: [] };
  
  if (!filters || typeof filters !== 'object') {
    return result;
  }
  
  // 允许的字段
  const allowedFields = ['author', 'publisher', 'language'];
  
  for (const [key, value] of Object.entries(filters)) {
    if (!allowedFields.includes(key)) {
      result.errors.push(`不允许的字段: ${key}`);
      continue;
    }
    
    const nameResult = validateName(value);
    if (nameResult.valid && nameResult.sanitized) {
      result.sanitized[key] = nameResult.sanitized;
    } else if (!nameResult.valid) {
      result.errors.push(`${key}: ${nameResult.error}`);
    }
  }
  
  result.valid = result.errors.length === 0;
  return result;
}

/**
 * 验证文件路径安全性
 * @param {string} filePath - 文件路径
 * @returns {{valid: boolean, sanitized: string, error?: string}}
 */
function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, sanitized: '', error: '文件路径不能为空' };
  }
  
  // 解析路径，防止路径遍历攻击
  const path = require('path');
  const os = require('os');
  
  // 标准化路径
  let normalized = path.normalize(filePath);
  
  // 检查路径遍历攻击
  if (normalized.includes('..')) {
    return { valid: false, sanitized: '', error: '路径不能包含 ..' };
  }
  
  // 检查是否在允许的目录内（临时目录或用户配置目录）
  const allowedDirs = [
    os.tmpdir(),
    path.join(os.homedir(), '.config', 'kindle-download'),
    path.join(os.tmpdir(), 'kindle_downloads')
  ];
  
  const resolved = path.resolve(normalized);
  const isAllowed = allowedDirs.some(dir => resolved.startsWith(path.resolve(dir)));
  
  if (!isAllowed) {
    return { valid: false, sanitized: '', error: '文件路径不在允许的目录内' };
  }
  
  // 检查文件扩展名
  const ext = path.extname(normalized).toLowerCase();
  const allowedExts = ['.epub', '.pdf', '.mobi', '.azw3'];
  if (!allowedExts.includes(ext)) {
    return { valid: false, sanitized: '', error: '不支持的文件类型' };
  }
  
  return { valid: true, sanitized: resolved };
}

module.exports = {
  sanitizeString,
  validateBookTitle,
  validateName,
  validateFilters,
  validateFilePath,
  DANGEROUS_PATTERNS
};

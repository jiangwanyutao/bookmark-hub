import DOMPurify from 'dompurify';

// 存档里的链接不能在扩展页里原地跳走。钩子挂在默认实例上，本扩展只有这里用 DOMPurify
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** 存档正文来自任意网页，显示前去掉脚本、事件、表单、内嵌框架和内联样式。 */
export const sanitizeArticle = (html: string): string =>
  DOMPurify.sanitize(html, {
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'iframe', 'style'],
    FORBID_ATTR: ['style'],
    ADD_ATTR: ['target'],
  });

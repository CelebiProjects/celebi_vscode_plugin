(function () {
    // Highlight source without parsing/reserializing it, preserving comments,
    // anchors, key order, indentation and multiline commands exactly.
    function escapeHtml(value) {
        return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    window.renderCelebiYaml = function (source) {
        const tokens = /"(?:\\[\s\S]|[^"\\])*"|'(?:''|[^'])*'|#[^\r\n]*|[^\s:[\]{},#"']+(?=\s*:(?:\s|$))|\b(?:true|false|null|[-+]?\d+(?:\.\d+)?)\b/g;
        let html = '', end = 0;
        for (const match of source.matchAll(tokens)) {
            html += escapeHtml(source.slice(end, match.index));
            const token = match[0];
            const after = source.slice(match.index + token.length);
            const kind = token.startsWith('#') ? 'comment'
                : /^\s*:/.test(after) ? 'key'
                : token.startsWith('"') || token.startsWith("'") ? 'string' : 'number';
            html += '<span class="yaml-' + kind + '">' + escapeHtml(token) + '</span>';
            end = match.index + token.length;
        }
        return html + escapeHtml(source.slice(end));
    };
})();

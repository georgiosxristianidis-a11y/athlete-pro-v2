const fs = require('fs');
let text = fs.readFileSync('C:/PROJECTS/athlete-pro/js/shared/athlete-room.js', 'utf8');
text = text.replace(/\\$\{/g, "${");
text = text.replace(/\\}/g, "}");
fs.writeFileSync('C:/PROJECTS/athlete-pro/js/shared/athlete-room.js', text, 'utf8');

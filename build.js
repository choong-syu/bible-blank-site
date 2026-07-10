const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const assets = ['index.html', 'app.js', 'bible-provider.js', 'styles.css'];

fs.mkdirSync(publicDir, { recursive: true });

for (const asset of assets) {
  fs.copyFileSync(path.join(__dirname, asset), path.join(publicDir, asset));
}

const fs = require('fs');

const files = [
  'c:/Users/Arumulla SivaKrishna/Desktop/GamaNext Clients/RJR Fresh/rjr-fresh-app/app/(main)/home.tsx',
  'c:/Users/Arumulla SivaKrishna/Desktop/GamaNext Clients/RJR Fresh/rjr-fresh-app/app/(main)/customer_orders.tsx',
  'c:/Users/Arumulla SivaKrishna/Desktop/GamaNext Clients/RJR Fresh/rjr-fresh-app/app/(main)/return_orders.tsx'
];

files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    // Basic brace counting
    let openBraces = 0;
    for (let char of content) {
      if (char === '{') openBraces++;
      if (char === '}') openBraces--;
    }
    console.log(`${file}: Balance = ${openBraces}`);
    
    // Check for obvious trailing braces
    const lines = content.split('\n');
    console.log(`${file}: Last 5 lines:`);
    console.log(lines.slice(-5).join('\n'));
  } catch (err) {
    console.error(`Error reading ${file}: ${err.message}`);
  }
});

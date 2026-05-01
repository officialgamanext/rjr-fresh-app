const fs = require('fs');

const files = [
  'c:/Users/Arumulla SivaKrishna/Desktop/GamaNext Clients/RJR Fresh/rjr-fresh-app/app/(main)/home.tsx',
  'c:/Users/Arumulla SivaKrishna/Desktop/GamaNext Clients/RJR Fresh/rjr-fresh-app/app/(main)/customer_orders.tsx',
  'c:/Users/Arumulla SivaKrishna/Desktop/GamaNext Clients/RJR Fresh/rjr-fresh-app/app/(main)/return_orders.tsx'
];

files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    
    // Find all styles.xyz usage
    const styleRefs = new Set();
    const refRegex = /styles\.([a-zA-Z0-9_]+)/g;
    let match;
    while ((match = refRegex.exec(content)) !== null) {
      styleRefs.add(match[1]);
    }
    
    // Find all defined styles across all StyleSheet.create calls
    const definedStyles = new Set();
    const styleSheetRegex = /StyleSheet\.create\(\{([\s\S]*?)\}\)/g;
    let ssMatch;
    while ((ssMatch = styleSheetRegex.exec(content)) !== null) {
      const styleBody = ssMatch[1];
      const defRegex = /([a-zA-Z0-9_]+)\s*:/g;
      let defMatch;
      while ((defMatch = defRegex.exec(styleBody)) !== null) {
        definedStyles.add(defMatch[1]);
      }
    }
    
    // Find missing styles
    const missing = [...styleRefs].filter(s => !definedStyles.has(s));
    if (missing.length > 0) {
      console.log(`${file}: Missing styles: ${missing.join(', ')}`);
    } else {
      console.log(`${file}: All styles defined.`);
    }
  } catch (err) {
    console.error(`Error processing ${file}: ${err.message}`);
  }
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔐 Setting up environment variables for Automation Excel Daily...\n');

// Check if .env already exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env file already exists. Skipping creation.');
  console.log('If you need to update it, please edit the .env file manually.\n');
} else {
  // Check if env-template.txt exists
  const templatePath = path.join(__dirname, 'env-template.txt');
  if (fs.existsSync(templatePath)) {
    try {
      // Copy template to .env
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      fs.writeFileSync(envPath, templateContent);
      
      console.log('✅ .env file created successfully!');
      console.log('📝 Please review and update the values in the .env file as needed.');
      console.log('🔒 The .env file is automatically ignored by Git for security.\n');
    } catch (error) {
      console.error('❌ Error creating .env file:', error.message);
      process.exit(1);
    }
  } else {
    console.error('❌ env-template.txt not found. Please create it first.');
    process.exit(1);
  }
}

console.log('📋 Next steps:');
console.log('1. Edit the .env file with your actual credentials');
console.log('2. Remove the env-template.txt file (optional)');
console.log('3. Run your automation scripts\n');

console.log('🚀 You\'re all set! The sensitive credentials are now stored securely in environment variables.');

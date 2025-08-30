#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

console.log('🧹 Cleaning Git History to Remove Sensitive Credentials...\n');

// Check if we're in a git repository
try {
  execSync('git status', { stdio: 'pipe' });
} catch (error) {
  console.error('❌ Not in a git repository. Please run this from your project directory.');
  process.exit(1);
}

console.log('📋 This script will help you clean up your git history to remove sensitive credentials.');
console.log('⚠️  WARNING: This will rewrite git history. Make sure you have a backup!\n');

console.log('🔍 Current git status:');
try {
  execSync('git status --porcelain', { stdio: 'inherit' });
} catch (error) {
  console.log('No changes to commit');
}

console.log('\n📝 Steps to clean up git history:');
console.log('1. First, remove the sensitive files from git tracking:');
console.log('   git rm --cached service-account-key.json');
console.log('   git rm --cached drive-credentials.json');
console.log('   git rm --cached credentials.json');
console.log('   git rm --cached token.json');

console.log('\n2. Commit the removal:');
console.log('   git commit -m "Remove sensitive credential files"');

console.log('\n3. Clean up git history (this rewrites history):');
console.log('   git filter-branch --force --index-filter \\');
console.log('     "git rm --cached --ignore-unmatch service-account-key.json drive-credentials.json credentials.json token.json" \\');
console.log('     --prune-empty --tag-name-filter cat -- --all');

console.log('\n4. Force push the cleaned history:');
console.log('   git push origin main --force');

console.log('\n⚠️  IMPORTANT NOTES:');
console.log('- This will rewrite git history, so anyone else working on this repo will need to re-clone');
console.log('- Make sure you have a backup before proceeding');
console.log('- The .env file should already be in .gitignore and not tracked');

console.log('\n🚀 After cleaning up, you should be able to push without GitHub blocking you.');
console.log('The sensitive credentials are now stored securely in environment variables.');

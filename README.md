MnemoMark Desktop App - Buttons Not Responding

Status
- App window opens successfully  
- Firebase Blaze plan upgraded (quota issue resolved)
- Chrome extension syncs tags correctly
- npm install and npm start complete without errors

Problem  
No buttons respond to clicks - menu items, authentication buttons, highlight buttons all unresponsive.

Reproduction
git clone https://github.com/DavidOjikutu/mnemomark-desktop-bug.git
cd mnemomark-desktop-bug  
npm install
npm start
Window opens but clicking any interactive element produces no response.

Files to Review
src/js/auth-service.js     (recent fetchWithTimeout changes)
src/js/auth-ui.js          (sign-in handlers)  
index.html                 (iframe positioning, script order)
index.css                  (iframe z-index, pointer-events)
index.js                   (HighlightManager initialization)
package.json

Dependencies
"devDependencies": {
  "custom-electron-titlebar": "^3.0.9", 
  "electron": "^5.0.4",
  "electron-builder": "^21.1.1"
}

Previous Attempts
- Added pointer-events: none to iframe when no src attribute
- Fixed auth-service.js syntax errors  
- Corrected script loading order
- Firebase Blaze plan eliminates 429 quota errors
- Removed problematic while loops from auth handlers

Request
Need help identifying JavaScript error or CSS stacking issue preventing event listeners from functioning. Application renders but remains completely unresponsive to user interaction.

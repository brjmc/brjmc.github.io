(function () {
    "use strict";

    var greetingElement = $('#terminal-greeting');
    var greetingText = "Hi";
    var introductionText = ", I'm Brendan";

    var bioElement = $('#terminal-bio');
    var bioText = "I make software in Vancouver, BC";

    var activeElement,count,cursor,cursorElement,cursorIndex,lengthOfPause,activeText;

    function fakeInput() {
        activeElement = greetingElement;
        count = 0;
        lengthOfPause = 2200;
        setBlankText(greetingElement, greetingText + introductionText);
        setBlankText(bioElement, bioText);            
        cursorIndex = 1;
        cursor = startToggle();
        setTimeout(function(){
            stopCursor();
            activeText = greetingText.split('');
            cursor = setInterval(printText, 100);
        },lengthOfPause);

        setTimeout(function(){
            stopToggle();
            activeText = introductionText.split('');
            cursor = setInterval(printText, 80);
        },(lengthOfPause * 1.5));

        setTimeout(function(){
            stopToggle();
            cursorIndex = 1;
            activeElement = bioElement;
            activeText = bioText.split('');
            cursor = setInterval(printText, 60);
        },(lengthOfPause * 3.1));
        

    }

    function setBlankText(element, text) {
        var blankString = Array(text.length + 3).join('&nbsp;');
        element.html(blankString);
    }

    function startToggle(){
        return setInterval(toggleCursor, 500);
    }

    function toggleCursor() {        
        var text = activeElement.text();
        if (text.charAt(cursorIndex) == '|') {
            text = text.substr(0,cursorIndex) + '&nbsp;' + text.substr(cursorIndex + 1)
            activeElement.html(text);
        } else {
            text = text.substr(0,cursorIndex) + '|' + text.substr(cursorIndex + 1)            
            activeElement.html(text);            
        }
    }

    function stopToggle(){
        var text = activeElement.text();
        text = cursorIndex >= text.length? text.substr(0, cursorIndex - 1): text.substr(0, cursorIndex) + '&nbsp;' + text.substr(cursorIndex + 1);
        activeElement.html(text);
        stopCursor();
    }

    function stopCursor(){
        clearInterval(cursor);
    }

    function printText(){
        var text = activeElement.text()        
        if(activeText.length > 0) {
            text = text.substr(0,cursorIndex++) + activeText.shift() + '|' + text.substr(cursorIndex + 1);
            activeElement.html(text);
        } else {
            stopCursor();
            activeElement.text(text);            
            cursor = startToggle();
        }
    }

    fakeInput();
})();
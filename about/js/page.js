var resizeAside = function () {
    var infobox = document.getElementById("infobox");
    if (window.innerWidth < 564) {
        infobox.style.removeProperty('float');
        infobox.style.setProperty('margin-left', '-2rem');
    } else {
        infobox.style.removeProperty('width');
        infobox.style.setProperty('float', 'right');
        infobox.style.setProperty('margin-left', '1rem');
    }
}

$('a.link-to-contact').click(function(e){
    e.preventDefault();
    $('a[href="#contact"]').tab('show');
});

$('a#mail').click(function(e){
    e.preventDefault();
    var provider = 'gmail.com';
    var me = 'brendan.mckay';
    prompt('Copy address to clipboard',me+'@'+provider);
    return false
});

window.onresize = resizeAside;
resizeAside();

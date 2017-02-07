var resizeAside = function () {
    var aside = document.getElementById("infobox");
    if (window.innerWidth < 564) {
        aside.style.removeProperty('float');
        aside.style.setProperty('margin-left', '-2rem');
    } else {
        aside.style.removeProperty('width');
        aside.style.setProperty('float', 'right');
        aside.style.setProperty('margin-left', '1rem');
    }
}

$('a.link-to-contact').click(function(e){
    e.preventDefault();
    $('a[href="#contact"]').tab('show');
});

window.onresize = resizeAside;
resizeAside();

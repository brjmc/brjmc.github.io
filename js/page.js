var resizeAside = function () {
    var aside = document.getElementById("infobox");
    if (window.innerWidth < 768) {
        aside.style.removeProperty('float');
    } else {
        aside.style.removeProperty('width');
        aside.style.setProperty('float', 'right');
    }
}
window.onresize = resizeAside;
resizeAside();

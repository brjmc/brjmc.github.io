var resizeAside = function () {
    var aside = document.getElementById("infobox");
    if (window.innerWidth < 768) {
        aside.style.removeProperty('float');
        aside.style.setProperty('border', '1px #a2a9b1 solid');
    } else {
        aside.style.removeProperty('width');
        aside.style.setProperty('float', 'right');
        aside.style.setProperty('border', '1px #a2a9b1 solid');
    }
}
window.onresize = resizeAside;
resizeAside();

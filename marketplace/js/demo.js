var removeHello = function () {
    var m = document.getElementById('intro-container');
    m.setAttribute('hidden', 'true');
}

var addHello = function () {
    var m = document.getElementById('intro-container');
    m.removeAttribute('hidden');
}

var closeHello = document.getElementById('closeHello');
closeHello.addEventListener('click', removeHello);


function loadProducts(callback) {
    var remoteUrl = "https://cpen400a-group9-product-server.herokuapp.com/products";
    var request = new XMLHttpRequest;
    request.open("GET", remoteUrl);
    request.timeout = 1000;
    request.onload = function () {
        if (request.status == 200) {
            var result = JSON.parse(request.responseText);
            if (typeof callback == "function") {
                callback(result);
            }
        } else {
            console.log("failed with stat code " + request.status + " retrying...");
            loadProducts(callback);
        }
    }
    request.ontimeout = function () {
        console.log("request timed out after" + request.timeout + "ms. retrying...");
        loadProducts(callback);
    }
    request.onerror = function () {
        console.log("network level error. retrying...");
        loadProducts(callback);
    }
    request.send();
};

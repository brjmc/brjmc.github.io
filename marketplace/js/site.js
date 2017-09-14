var cart = {};
var inactiveTime = 0;
var timer;
var cartObj;
var products = {};
var stupidFlag = false;

//link to cartObj.addToCart, as required by outline
function addToCart(productName) {
    return cartObj.addToCart(productName);
}
//link to cartObj.removeFromCart, as required by outline
function removeFromCart(productName) {
    return cartObj.removeFromCart(productName);
}

//Load products list DOM with given products object
function loadProductsDOM(_products) {
    addHello();
    $.each(_products, function (index, value) {
        var url = 'images/' + value["url"].split('/').pop();
        console.log(url)
        
        $("ul#productList").append($("<li/>", {
            "class": "product",
            "data-productname": index,
            "data-productprice": value["price"],
            "data-currentquantity": "0",
            "html": $("<div/>", {
                "class": "product-inner",
                "html": $("<img/>", {
                    "src": url
                }).prop("outerHTML") +
                        $("<div/>", {
                            "class": "detail",
                            "html": $("<button/>", {
                                "type": "button",
                                "class": "addCart",
                                "tabindex": "-1"
                            }).prop("outerHTML") +
                            $("<button/>", {
                                "type": "button",
                                "class": "removeCart",
                                "tabindex": "-1"
                            }).prop("outerHTML") +
                            $("<span/>", {
                                "class": "price",
                                "html": value["price"]
                            }).prop("outerHTML")
                        }).prop("outerHTML")
            }).prop("outerHTML") +
                $("<div/>", {
                    "class": "productName",
                    "html": index
                }).prop("outerHTML")
        }));
    });
    $("#preloader").remove();
}

function showLoader() {
    $("#ajaxLoader").addClass("visible");
}

function hideLoader() {
    $("#ajaxLoader").removeClass("visible");
}

$(document).ready(function () {
    loadProducts(function (result) {
        products = result;
        loadProductsDOM(products);

        //initiate cart handlers
        //note here, that the global cart should still update in sync since objects are copied by reference.
        cartObj = initCart(cart, products, null, function () {
            //beforeUpdate
            timer.resetTimeout();
        });
        for(product in products){
            cartObj.updateCart(product);
        }
    });
    
    //initiate timer
    timer = initTimer($(".inactiveTime"), 300, function () {
        //all this does is copy the timer.inactivetime to global variable every second, as required by stupid outline.
        inactiveTime = timer.inactiveTime;
    });
    

    //initiate modal handlers
    initModal($("#modalCart"), $("#cartButton"), function () {
        //onOpen
        timer.resetTimeout();
    }, function () {
        //onClose
        cartObj.clearValidationMessage();
        timer.resetTimeout();
    });

    //bind Add Cart Buttons - dynamically, for modal
    $("body").on("click", ".addCart", function () {
        cartObj.addToCartByObj(this);
    });

    //bind Remove Cart Buttons - dynamically, for modal
    $("body").on("click", ".removeCart", function () {
        cartObj.removeFromCartByObj(this);
    });
    
    //bind the cart modal checkout button
    $("body").on("click", "#btnCheckout", function () {
        timer.resetTimeout();
        //disablecheckout button
        $(".btnCheckout").attr("disabled", "true");
        //show loading message
        showLoader();
        //get products from     server
        loadProducts(function (result) {
            hideLoader();
            //validate cart against retrieved products
            cartObj.validateCart(result);
        });
    });

    $("body").on("click", "#btnConfirmCheckout", function () {
            timer.resetTimeout();
        cartObj.clearValidationMessage();
        cartObj.confirmCheckout();
    });

    $("body").on("click", "#btnClearValidationMsg", function () {
            timer.resetTimeout();
        cartObj.clearValidationMessage();
    });

});
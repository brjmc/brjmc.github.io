var _cart = {
    cart: null,
    products: null,
    onUpdated: null,
    beforeUpdate: null,

    init: function (cart, products, onUpdated, beforeUpdate) {
        this.cart = cart;
        this.products = products;
        this.onUpdated = onUpdated;
        this.beforeUpdate = beforeUpdate;
    },

    //get Product Name given a child DOM object
    getProductName: function (elem) {
        return $(elem).closest("[data-productname]").data("productname");
    },

    addToCartByObj: function (obj) {
        return this.addToCart(this.getProductName(obj));
    },
    removeFromCartByObj: function (obj) {
        return this.removeFromCart(this.getProductName(obj));
    },

    // add (or increment quantity) a product in cart
    addToCart: function (productName) {
        if (typeof this.beforeUpdate == "function") {
            this.beforeUpdate();
        }
        if (!this.products[productName]["quantity"]) {
            alert("No more available in stock!");
            return;
        }

        this.products[productName]["quantity"]--;
        if (!this.cart[productName]) {
            this.cart[productName] = 1;
        } else {
            this.cart[productName]++;
        }
        this.updateCart(productName);
    },

    // remove (or decrement quantity) a product in cart
    removeFromCart: function (productName) {
        if (typeof this.beforeUpdate == "function") {
            this.beforeUpdate();
        }
        if (this.cart[productName]) {
            this.cart[productName]--;
            this.products[productName]["quantity"]++;
            if (!this.cart[productName]) {
                delete this.cart[productName];
            }
            this.updateCart(productName);
        } else {
            alert("This product does not exist in your cart!");
        }
    },

    updateProducts: function (newProducts, priceChanges, quantityChanges) {
        for (var product in newProducts) {
            this.products[product].price = newProducts[product].price;
            this.products[product].quantity = this.cart.hasOwnProperty(product)
                ? newProducts[product].quantity - cart[product]
                : newProducts[product].quantity;

            $("[data-productname=" + product + "] .price").html(this.products[product]["price"]);

            if (this.cart[product]) {
                if (quantityChanges && quantityChanges[product]) {
                    if (quantityChanges[product]["new"] === 0) {
                        delete this.cart[product];
                        this.addCartMessage(product + " is no longer available and has been removed from your cart.");
                    } else {
                        this.cart[product] = quantityChanges[product]["new"];
                    }
                    $("#cartTable [data-productname=" + product + "] .wasQuantity span").html("(was " + quantityChanges[product]["old"] + ")");
                }

                if (priceChanges && priceChanges[product]) {
                    $("#cartTable [data-productname=" + product + "] .wasPrice span").html("(was $" + priceChanges[product]["old"] + ")");
                }
            }
            this.updateCart(product);
        }
    },
    addCartMessage: function(msg) {
        $("#modalCart tbody").append($("<tr/>", {
            "class" : "message",
            "html" : $("<td/>", {
                "colspan" : "6",
                "html" : msg
            })
        }));
    },

    clearValidationMessage: function () {
        $("#modalCart .modal-inner").removeClass("validationScreen");
        $("#modalCart .wasPrice span").html("");
        $("#modalCart .wasQuantity span").html("");
        $("#modalCart tr.message").remove();
    },

    //update cart objects and DOM for given productName
    updateCart: function (productName) {
        //update cart total DOM
        this.displayCartTotal();

        //if no more in stock, disable button and change message
        if (this.products[productName].quantity < 1) {
            $("[data-productname=" + productName + "]").addClass("outOfStock");
            $("[data-productname=" + productName + "] .addCart").attr("disabled", "disabled");

        } else { //otherwise make sure the button is enabled
            $("[data-productname=" + productName + "].outOfStock").removeClass("outOfStock");
            $("[data-productname=" + productName + "] .addCart").removeAttr("disabled");
        }

        //update data-currentquantity in DOM
        $("#productList .product[data-productname=" + productName + "]").attr("data-currentquantity", cart[productName] ? cart[productName] : "0");

        //if quantity is zero
        if (!this.cart[productName]) {
            //remove cart table row
            $("#modalCart tr[data-productName=" + productName + "]").remove();
            //if cart is compeletely empty
            if ($.isEmptyObject(this.cart)) {
                //hide cart table and display "no item in cart"
                $("#modalCart .modal-inner").addClass("empty");
            }
        } else {
            if (!$("#modalCart tr[data-productName=" + productName + "]").length) {
                //if cart table does not contain row for given product name, add one.
                this.addCartRow(productName);
            }
            //update quantity field in the cart table
            $("[data-productname=" + productName + "] .quantity").html(this.cart[productName]);

            //update price field in the cart table
            $("[data-productname=" + productName + "] .productTotalPrice").html(this.cart[productName] * this.products[productName]["price"]);

            //ensure cart table is visible
            $("#modalCart .modal-inner.empty").removeClass("empty");
        }

        if (typeof this.onUpdated == "function") {
            this.onUpdated();
        }
    },


    // calculate total amount in cart
    getCartTotal: function () {
        var sum = 0;
        for (product in this.cart) {
            sum += this.products[product].price * this.cart[product];
        }
        return sum;
    },

    // update Cart Total in DOM
    displayCartTotal: function () {
        $(".totalPrice").html(this.getCartTotal());
    },

    // add row for given productName in cart table
    addCartRow: function (productName) {
        $("#modalCart #cartTable tbody ").append($("<tr/>", {
            "data-productname": productName,
            "html": $("<th/>", {
                "html": productName
            }).prop("outerHTML") +
                    $("<td/>", {
                        "html": $("<button/>", {
                            "type": "button",
                            "class": "removeCart"
                        }).prop("outerHTML") +
                                $("<span/>", {
                                    "class": "quantity",
                                    "html": cart[productName]
                                }).prop("outerHTML") +
                                $("<button/>", {
                                    "type": "button",
                                    "class": "addCart"
                                }).prop("outerHTML")
                    }).prop("outerHTML") +
                    $("<td/>", {
                        "class": "wasQuantity",
                        "html": $("<span/>")
                    }).prop("outerHTML") +
                    $("<td/>", {
                        "html": $("<span/>", {
                            "class": "price",
                            "html": this.products[productName]["price"]
                        })
                    }).prop("outerHTML") +
                    $("<td/>", {
                        "class": "wasPrice",
                        "html": $("<span/>")
                    }).prop("outerHTML") +
                    $("<td/>", {
                        "html": $("<span/>", {
                            "class": "productTotalPrice"
                        })
                    }).prop("outerHTML")
        }));
    },

    //Called from the cart object, this initiates the checkout validation process
    validateCart: function (newProducts) {
        var originalTotalPrice = this.getCartTotal();
        var priceChanges = [];
        var insufficientStockItems = [];
        var changed = false;
        for (product in this.cart) {
            //keep track of price changes
            if (products[product].price !== newProducts[product].price) {
                changed = true;
                priceChanges[product] = {
                    "old": products[product].price,
                    "new": newProducts[product].price
                }
            }
            //keep track of items where available stock < number in cart
            if (newProducts[product].quantity < this.cart[product]) {
                changed = true;
                this.cart[product] = newProducts[product].quantity;
                insufficientStockItems[product] = {
                    "old": this.cart[product],
                    "new": newProducts[product].quantity
                }
            }
        }
        //update global product list so that it reflects info retrieved from server
        cartObj.updateProducts(newProducts, priceChanges, insufficientStockItems);
        $("#btnCheckout").removeAttr("disabled");
        
        if (changed) {
            $("#wasTotalPrice").html(originalTotalPrice);
            $("#modalCart .modal-inner").addClass("validationScreen");
        } else {
            this.confirmCheckout();
        }
    },

    confirmCheckout: function() {
        alert("Your order has been processed! \nFinal Price: $" + this.getCartTotal());
    }
}

function initCart(cart, product, onUpdated, beforeUpdate) {
    var c = Object.create(_cart);
    _cart.init.call(c, cart, product, onUpdated, beforeUpdate);
    return c;
}
// Author: Jae Yeong Bae
// Written specifically for CPEN400A class

var _modal = {
    $modal: null,
    $caller: null,
    isOpen: false,
    beforeShow: null,
    onClose: null,
    init: function (e, c, b, o) {
        this.$modal = $(e);
        this.$caller = $(c);
        this.beforeShow = b;
        this.onClose = o;
        var modal = this;
        $(document).keydown(function (e) {
            //if key is esc and modal is open, close it
            if (e.which == 27 && modal.isOpen) {
                modal.close();
            }
        });
        this.$modal.find(".btnClose,.backdrop").click(function () {
            modal.close();
        });
        this.$caller.click(function () {
            modal.open();
        });
    },
    open: function () {
        if (typeof this.beforeShow == "function") {
            this.beforeShow();
        }
        this.$modal.fadeIn(200);
        this.isOpen = true;
    },
    close: function () {
        if (typeof this.onClose == "function") {
            this.onClose();
        }
        this.$modal.fadeOut(200);
        this.isOpen = false;
    }
}

function initModal(elem, caller, beforeShow, onClose) {
    var m = Object.create(_modal);
    _modal.init.call(m, elem, caller, beforeShow, onClose);
    return m;
}
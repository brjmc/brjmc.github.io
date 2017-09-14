var _timer = {
    $displayElem: null,
    alertAt: null,
    timerHandler: null,
    inactiveTime: null,

    step: null,

    //initiate timer
    init: function (displayElem, alertAt, step) {
        this.$displayElem = $(displayElem);
        this.alertAt = alertAt;
        this.step = step;
        this.resetTimeout();
    },

    //alert inactive user
    alertInactiveUser: function () {
        alert("Hey there! Are you still planning to buy something?");
        this.resetTimeout();
    },

    // set inactiveTime to 0, display new value, restart timer
    resetTimeout: function () {
        clearInterval(this.timerHandler);
        this.inactiveTime = 0;
        this.$displayElem.html(this.inactiveTime);
        if (typeof step == "function") {
            step();
        }
        var t = this;
        this.timerHandler = setInterval(function () {
            t.updateTimeout();
        }, 1000);
    },

    // increment inactiveTime, update displayed value
    updateTimeout: function () {
        if (this.inactiveTime++ >= this.alertAt) {
            this.alertInactiveUser();
        };
        if (typeof this.step == "function") {
            this.step();
        }
        this.$displayElem.html(this.inactiveTime);
    }
}

function initTimer(displayElem, alertAt, step) {
    var t = Object.create(_timer);
    _timer.init.call(t, displayElem, alertAt, step);
    return t;
}
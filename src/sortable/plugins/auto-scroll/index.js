import {
    cancelThrottle,
    css,
    expando,
    getParentAutoScrollElement,
    getRect,
    getWindowScrollingElement,
    off,
    on,
    scrollBy,
    throttle
} from '../../core/utils.js';

import Sortable from '../../core/sortable.js';

let autoScrolls = [],
    scrollEl,
    scrollRootEl,
    scrolling = false,
    lastAutoScrollX,
    lastAutoScrollY,
    touchEvt,
    pointerElemChangedInterval;

function AutoScrollPlugin() {

    function AutoScroll() {
        this.defaults = {
            scroll: true,
            scrollSensitivity: 30,
            scrollSpeed: 10,
            bubbleScroll: true
        };

        // Bind all private methods
        for (let fn in this) {
            if (fn.charAt(0) === '_' && typeof this[fn] === 'function') {
                this[fn] = this[fn].bind(this);
            }
        }
    }

    AutoScroll.prototype = {
        dragStarted() {
            on(document, 'dragover', this._handleAutoScroll);
        },

        dragOverCompleted({ originalEvent }) {
            // For when bubbling is canceled and using fallback (fallback 'touchmove' always reached)
            if (!this.options.dragOverBubble && !originalEvent.rootEl) {
                this._handleAutoScroll(originalEvent);
            }
        },

        drop() {
            off(document, 'dragover', this._handleAutoScroll);

            clearPointerElemChangedInterval();
            clearAutoScrolls();
            cancelThrottle();
        },

        nulling() {
            touchEvt =
                scrollRootEl =
                    scrollEl =
                        scrolling =
                            pointerElemChangedInterval =
                                lastAutoScrollX =
                                    lastAutoScrollY = null;

            autoScrolls.length = 0;
        },

        _handleAutoScroll(evt) {
            const x = (evt.touches ? evt.touches[0] : evt).clientX,
                y = (evt.touches ? evt.touches[0] : evt).clientY,

                elem = document.elementFromPoint(x, y);

            touchEvt = evt;

             // if DnD is enabled (and browser has good autoscrolling), first autoscroll will already scroll, so get parent autoscroll of first autoscroll
            if (!this.options.bubbleScroll || getParentAutoScrollElement(elem, true) === getWindowScrollingElement()) {
                clearAutoScrolls();
                return;
            }
            autoScroll(evt, this.options, getParentAutoScrollElement(elem, false), false);
        }
    };

    return Object.assign(AutoScroll, {
        pluginName: 'scroll',
        initializeByDefault: true
    });
}

function clearAutoScrolls() {
    autoScrolls.forEach(function(autoScroll) {
        clearInterval(autoScroll.pid);
    });
    autoScrolls = [];
}

function clearPointerElemChangedInterval() {
    clearInterval(pointerElemChangedInterval);
}


const autoScroll = throttle(function(evt, options, rootEl) {
    // Bug: https://bugzilla.mozilla.org/show_bug.cgi?id=505521
    if (!options.scroll) return;
    const x = (evt.touches ? evt.touches[0] : evt).clientX,
        y = (evt.touches ? evt.touches[0] : evt).clientY,
        sens = options.scrollSensitivity,
        speed = options.scrollSpeed,
        winScroller = getWindowScrollingElement();

    let scrollThisInstance = false,
        scrollCustomFn;

    // New scroll root, set scrollEl
    if (scrollRootEl !== rootEl) {
        scrollRootEl = rootEl;

        clearAutoScrolls();

        scrollEl = options.scroll;
        scrollCustomFn = options.scrollFn;

        if (scrollEl === true) {
            scrollEl = getParentAutoScrollElement(rootEl, true);
        }
    }


    let layersOut = 0;
    let currentParent = scrollEl;
    do {
        let	el = currentParent,
            rect = getRect(el),

            top = rect.top,
            bottom = rect.bottom,
            left = rect.left,
            right = rect.right,

            width = rect.width,
            height = rect.height,

            canScrollX,
            canScrollY,

            scrollWidth = el.scrollWidth,
            scrollHeight = el.scrollHeight,

            elCSS = css(el),

            scrollPosX = el.scrollLeft,
            scrollPosY = el.scrollTop;


        if (el === winScroller) {
            canScrollX = width < scrollWidth && (elCSS.overflowX === 'auto' || elCSS.overflowX === 'scroll' || elCSS.overflowX === 'visible');
            canScrollY = height < scrollHeight && (elCSS.overflowY === 'auto' || elCSS.overflowY === 'scroll' || elCSS.overflowY === 'visible');
        } else {
            canScrollX = width < scrollWidth && (elCSS.overflowX === 'auto' || elCSS.overflowX === 'scroll');
            canScrollY = height < scrollHeight && (elCSS.overflowY === 'auto' || elCSS.overflowY === 'scroll');
        }

        let vx = canScrollX && (Math.abs(right - x) <= sens && (scrollPosX + width) < scrollWidth) - (Math.abs(left - x) <= sens && !!scrollPosX);
        let vy = canScrollY && (Math.abs(bottom - y) <= sens && (scrollPosY + height) < scrollHeight) - (Math.abs(top - y) <= sens && !!scrollPosY);


        if (!autoScrolls[layersOut]) {
            for (let i = 0; i <= layersOut; i++) {
                if (!autoScrolls[i]) {
                    autoScrolls[i] = {};
                }
            }
        }

        if (autoScrolls[layersOut].vx !== vx || autoScrolls[layersOut].vy !== vy || autoScrolls[layersOut].el !== el) {
            autoScrolls[layersOut].el = el;
            autoScrolls[layersOut].vx = vx;
            autoScrolls[layersOut].vy = vy;

            clearInterval(autoScrolls[layersOut].pid);

            if (vx !== 0 || vy !== 0) {
                scrollThisInstance = true;
                /* jshint loopfunc:true */
                autoScrolls[layersOut].pid = setInterval((function () {
                    // emulate drag over during autoscroll (fallback), emulating native DnD behaviour

                    let scrollOffsetY = autoScrolls[this.layer].vy ? autoScrolls[this.layer].vy * speed : 0;
                    let scrollOffsetX = autoScrolls[this.layer].vx ? autoScrolls[this.layer].vx * speed : 0;

                    if (typeof(scrollCustomFn) === 'function') {
                        if (scrollCustomFn.call(Sortable.dragged.parentNode[expando], scrollOffsetX, scrollOffsetY, evt, touchEvt, autoScrolls[this.layer].el) !== 'continue') {
                            return;
                        }
                    }

                    scrollBy(autoScrolls[this.layer].el, scrollOffsetX, scrollOffsetY);
                }).bind({layer: layersOut}), 24);
            }
        }
        layersOut++;
    } while (options.bubbleScroll && currentParent !== winScroller && (currentParent = getParentAutoScrollElement(currentParent, false)));
    scrolling = scrollThisInstance; // in case another function catches scrolling as false in between when it is not
}, 30);

export default AutoScrollPlugin;
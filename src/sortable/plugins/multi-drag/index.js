import {
    clone,
    closest,
    css,
    expando,
    getRect,
    index,
    matrix,
    off,
    on,
    setRect,
    toggleClass,
    unsetRect
} from '../../core/utils.js';

import dispatchEvent from '../../core/event-dispatcher.js';

let multiDragElements = [],
    multiDragClones = [],
    lastMultiDragSelect, // for selection with modifier key down (SHIFT)
    multiDragSortable,
    initialFolding = false, // Initial multi-drag fold when drag started
    folding = false, // Folding any other time
    dragStarted = false,
    dragEl,
    clonesFromRect,
    clonesHidden;

function MultiDragPlugin() {
    function MultiDrag(sortable) {
        // Bind all private methods
        for (let fn in this) {
            if (fn.charAt(0) === '_' && typeof this[fn] === 'function') {
                this[fn] = this[fn].bind(this);
            }
        }

        if (!sortable.options.avoidImplicitDeselect) {
            on(document, 'pointerup', this._deselectMultiDrag);
        }

        on(document, 'keydown', this._checkKeyDown);
        on(document, 'keyup', this._checkKeyUp);

        this.defaults = {
            selectedClass: 'sortable-selected',
            multiDragKey: null,
            avoidImplicitDeselect: false,
            setData(dataTransfer, dragEl) {
                let data = '';
                if (multiDragElements.length && multiDragSortable === sortable) {
                    multiDragElements.forEach((multiDragElement, i) => {
                        data += (!i ? '' : ', ') + multiDragElement.textContent;
                    });
                } else {
                    data = dragEl.textContent;
                }
                dataTransfer.setData('Text', data);
            }
        };
    }

    MultiDrag.prototype = {
        multiDragKeyDown: false,
        isMultiDrag: false,


        delayStartGlobal({ dragEl: dragged }) {
            dragEl = dragged;
        },

        delayEnded() {
            this.isMultiDrag = ~multiDragElements.indexOf(dragEl);
        },

        setupClone({ sortable, cancel }) {
            if (!this.isMultiDrag) return;
            for (let i = 0; i < multiDragElements.length; i++) {
                multiDragClones.push(clone(multiDragElements[i]));

                let multiDragClone = multiDragClones[i];
                multiDragClone.sortableIndex = multiDragElements[i].sortableIndex;

                multiDragClone.draggable = false;
                multiDragClone.style['will-change'] = '';
                toggleClass(multiDragClone, this.options.selectedClass, false);
                multiDragElements[i] === dragEl && toggleClass(multiDragClone, this.options.chosenClass, false);
            }

            sortable._hideClone();
            cancel();
        },

        clone({ sortable, rootEl, dispatchSortableEvent, cancel }) {
            if (!this.isMultiDrag) return;
            if (!this.options.removeCloneOnHide) {
                if (multiDragElements.length && multiDragSortable === sortable) {
                    insertMultiDragClones(true, rootEl);
                    dispatchSortableEvent('clone');

                    cancel();
                }
            }
        },

        showClone({ cloneNowShown, rootEl, cancel }) {
            if (!this.isMultiDrag) return;
            insertMultiDragClones(false, rootEl);
            multiDragClones.forEach(clone => {
                css(clone, 'display', '');
            });

            cloneNowShown();
            clonesHidden = false;
            cancel();
        },

        hideClone({ cloneNowHidden, cancel }) {
            if (!this.isMultiDrag) return;
            multiDragClones.forEach(clone => {
                css(clone, 'display', 'none');
                if (this.options.removeCloneOnHide && clone.parentNode) {
                    clone.parentNode.removeChild(clone);
                }
            });

            cloneNowHidden();
            clonesHidden = true;
            cancel();
        },

        dragStartGlobal({ sortable }) {
            if (!this.isMultiDrag && multiDragSortable) {
                multiDragSortable.multiDrag._deselectMultiDrag();
            }

            multiDragElements.forEach(multiDragElement => {
                multiDragElement.sortableIndex = index(multiDragElement);
                multiDragElement.sortableFrom = multiDragElement.parentElement
            });

            // Sort multi-drag elements
            multiDragElements = multiDragElements.sort(function (a, b) {
                return a.sortableIndex - b.sortableIndex;
            });
            dragStarted = true;
        },

        dragStarted({ sortable }) {
            if (!this.isMultiDrag) return;
            if (this.options.sort) {
                // Capture rects,
                // hide multi drag elements (by positioning them absolute),
                // set multi drag elements rects to dragRect,
                // show multi drag elements,
                // animate to rects,
                // unset rects & remove from DOM

                sortable.captureAnimationState();

                if (this.options.animation) {
                    multiDragElements.forEach(multiDragElement => {
                        if (multiDragElement === dragEl) return;
                        css(multiDragElement, 'position', 'absolute');
                    });

                    let dragRect = getRect(dragEl, false, true, true);

                    multiDragElements.forEach(multiDragElement => {
                        if (multiDragElement === dragEl) return;
                        setRect(multiDragElement, dragRect);
                    });

                    folding = true;
                    initialFolding = true;
                }
            }

            sortable.animateAll(() => {
                folding = false;
                initialFolding = false;

                if (this.options.animation) {
                    multiDragElements.forEach(multiDragElement => {
                        unsetRect(multiDragElement);
                    });
                }

                // Remove all auxiliary multidrag items from el, if sorting enabled
                if (this.options.sort) {
                    removeMultiDragElements();
                }
            });
        },

        dragOver({ target, completed, cancel }) {
            if (folding && ~multiDragElements.indexOf(target)) {
                completed(false);
                cancel();
            }
        },

        dragOverCompleted({ sortable, isOwner, insertion, activeSortable, parentEl, putSortable }) {
            let options = this.options;
            if (insertion) {
                // Clones must be hidden before folding animation to capture dragRectAbsolute properly
                if (isOwner) {
                    activeSortable._hideClone();
                }

                initialFolding = false;
                // If leaving sort:false root, or already folding - Fold to new location
                if (options.animation && multiDragElements.length > 1 && (folding || !isOwner && !activeSortable.options.sort && !putSortable)) {
                    // Fold: Set all multi drag elements's rects to dragEl's rect when multi-drag elements are invisible
                    let dragRectAbsolute = getRect(dragEl, false, true, true);

                    multiDragElements.forEach(multiDragElement => {
                        if (multiDragElement === dragEl) return;
                        setRect(multiDragElement, dragRectAbsolute);

                        // Move element(s) to end of parentEl so that it does not interfere with multi-drag clones insertion if they are inserted
                        // while folding, and so that we can capture them again because old sortable will no longer be fromSortable
                        parentEl.appendChild(multiDragElement);
                    });

                    folding = true;
                }

                // Clones must be shown (and check to remove multi drags) after folding when interfering multiDragElements are moved out
                if (!isOwner) {
                    // Only remove if not folding (folding will remove them anyways)
                    if (!folding) {
                        removeMultiDragElements();
                    }

                    if (multiDragElements.length > 1) {
                        let clonesHiddenBefore = clonesHidden;
                        activeSortable._showClone(sortable);

                        // Unfold animation for clones if showing from hidden
                        if (activeSortable.options.animation && !clonesHidden && clonesHiddenBefore) {
                            multiDragClones.forEach(clone => {
                                activeSortable.addAnimationState({
                                    target: clone,
                                    rect: clonesFromRect
                                });

                                clone.fromRect = clonesFromRect;
                                clone.thisAnimationDuration = null;
                            });
                        }
                    } else {
                        activeSortable._showClone(sortable);
                    }
                }
            }
        },

        dragOverAnimationCapture({ dragRect, isOwner, activeSortable }) {
            multiDragElements.forEach(multiDragElement => {
                multiDragElement.thisAnimationDuration = null;
            });

            if (activeSortable.options.animation && !isOwner && activeSortable.multiDrag.isMultiDrag) {
                clonesFromRect = Object.assign({}, dragRect);
                let dragMatrix = matrix(dragEl, true);
                clonesFromRect.top -= dragMatrix.f;
                clonesFromRect.left -= dragMatrix.e;
            }
        },

        dragOverAnimationComplete() {
            if (folding) {
                folding = false;
                removeMultiDragElements();
            }
        },

        drop({ originalEvent: evt, rootEl, parentEl, sortable, dispatchSortableEvent, oldIndex, putSortable }) {
            let toSortable = (putSortable || this.sortable);

            if (!evt) return;

            let options = this.options,
                children = parentEl.children;

            // Multi-drag selection
            if (!dragStarted) {
                let shouldSelect = !multiDragElements.includes(dragEl)
                if (options.multiDragKey && !this.multiDragKeyDown) {
                    !shouldSelect && (shouldSelect ||= multiDragElements.length !== 1)
                    this._deselectMultiDrag();
                }
                toggleClass(dragEl, options.selectedClass, shouldSelect);
                if (shouldSelect) {
                    multiDragElements.push(dragEl);
                    dispatchEvent({
                        sortable,
                        rootEl,
                        name: 'select',
                        targetEl: dragEl,
                        newIndex: index(dragEl),
                        originalEvent: evt
                    });

                    // Modifier activated, select from last to dragEl
                    if (evt.shiftKey && lastMultiDragSelect && sortable.el.contains(lastMultiDragSelect)) {
                        let lastIndex = index(lastMultiDragSelect),
                            currentIndex = index(dragEl);
                        if (~lastIndex && ~currentIndex && lastIndex !== currentIndex) {
                            // Must include lastMultiDragSelect (select it), in case modified selection from no selection
                            // (but previous selection existed)
                            let n, i;
                            if (currentIndex > lastIndex) {
                                i = lastIndex;
                                n = currentIndex;
                            } else {
                                i = currentIndex;
                                n = lastIndex + 1;
                            }

                            for (; i < n; i++) {
                                if (multiDragElements.includes(children[i])) continue;
                                toggleClass(children[i], options.selectedClass, true);
                                multiDragElements.push(children[i]);

                                dispatchEvent({
                                    sortable,
                                    rootEl,
                                    name: 'select',
                                    targetEl: children[i],
                                    newIndex: index(children[i]),
                                    originalEvent: evt
                                });
                            }
                        }
                    } else {
                        lastMultiDragSelect = dragEl;
                    }

                    multiDragSortable = toSortable;
                } else {
                    multiDragElements.splice(multiDragElements.indexOf(dragEl), 1);
                    lastMultiDragSelect = null;
                    dispatchEvent({
                        sortable,
                        rootEl: dragEl.parentElement,
                        name: 'deselect',
                        targetEl: dragEl,
                        originalEvent: evt,
                        newIndex: index(dragEl),
                    });
                }
            }

            // Multi-drag drop
            if (dragStarted && this.isMultiDrag) {
                folding = false;
                // Do not "unfold" after around dragEl if reverted
                if ((parentEl[expando].options.sort || parentEl !== rootEl) && multiDragElements.length > 1) {
                    let dragRect = getRect(dragEl),
                        multiDragIndex = index(dragEl, `:not(.${ this.options.selectedClass })`);

                    if (!initialFolding && options.animation) dragEl.thisAnimationDuration = null;

                    toSortable.captureAnimationState();

                    if (!initialFolding) {
                        if (options.animation) {
                            dragEl.fromRect = dragRect;
                            multiDragElements.forEach(multiDragElement => {
                                multiDragElement.thisAnimationDuration = null;
                                if (multiDragElement !== dragEl) {
                                    let rect = folding ? getRect(multiDragElement) : dragRect;
                                    multiDragElement.fromRect = rect;

                                    // Prepare unfold animation
                                    toSortable.addAnimationState({
                                        target: multiDragElement,
                                        rect
                                    });
                                }
                            });
                        }

                        // Multi drag elements are not necessarily removed from the DOM on drop, so to reinsert
                        // properly they must all be removed
                        removeMultiDragElements();

                        multiDragElements.forEach(multiDragElement => {
                            if (children[multiDragIndex]) {
                                parentEl.insertBefore(multiDragElement, children[multiDragIndex]);
                            } else {
                                parentEl.appendChild(multiDragElement);
                            }
                            multiDragIndex++;
                        });

                        // If initial folding is done, the elements may have changed position because they are now
                        // unfolding around dragEl, even though dragEl may not have his index changed, so update event
                        // must be fired here as Sortable will not.
                        if (oldIndex === index(dragEl)
                            && multiDragElements.some(
                                multiDragElement => multiDragElement.sortableIndex !== index(multiDragElement))) {
                            dispatchSortableEvent('update');
                            dispatchSortableEvent('sort');
                        }
                    }

                    // Must be done after capturing individual rects (scroll bar)
                    multiDragElements.forEach(unsetRect);

                    toSortable.animateAll();
                }

                multiDragSortable = toSortable;
            }

            // Remove clones if necessary
            if (rootEl === parentEl || (putSortable && putSortable.lastPutMode !== 'clone')) {
                multiDragClones.forEach(clone => {
                    clone.parentNode && clone.parentNode.removeChild(clone);
                });
            }
        },

        nullingGlobal() {
            this.isMultiDrag = dragStarted = false;
            multiDragClones.length = 0;
        },

        destroyGlobal() {
            this._deselectMultiDrag();
            off(document, 'pointerup', this._deselectMultiDrag);
            off(document, 'mouseup', this._deselectMultiDrag);
            off(document, 'touchend', this._deselectMultiDrag);

            off(document, 'keydown', this._checkKeyDown);
            off(document, 'keyup', this._checkKeyUp);
        },

        _deselectMultiDrag(evt) {
            if (typeof dragStarted !== "undefined" && dragStarted) return;

            // Only deselect if target is not item in this sortable
            if (evt && closest(evt.target, this.options.draggable, this.sortable.el, false)) return;

            // Only deselect if left click
            if (evt?.button) return;

            while (multiDragElements.length) {
                let el = multiDragElements[0];
                toggleClass(el, this.options.selectedClass, false);
                multiDragElements.shift();
                dispatchEvent({
                    sortable: el.parentElement.sortable,
                    rootEl: el.parentElement,
                    name: 'deselect',
                    targetEl: el,
                    newIndex: index(el),
                    originalEvent: evt
                });
            }
        },

        _checkKeyDown(evt) {
            if (evt.key === this.options.multiDragKey
                || this.options.multiDragKey?.includes(evt.key)) {
                this.multiDragKeyDown = true;
            }
        },

        _checkKeyUp(evt) {
            if (evt.key === this.options.multiDragKey
                || this.options.multiDragKey?.includes(evt.key)) {
                this.multiDragKeyDown = false;
            }
        }
    };

    return Object.assign(MultiDrag, {
        // Static methods & properties
        pluginName: 'multiDrag',
        utils: {
            /**
             * Selects the provided multi-drag item
             * @param  {HTMLElement} el    The element to be selected
             */
            select(el) {

                let sortable = el.parentNode[expando];
                if (!sortable?.options.multiDrag) return;
                if (multiDragElements.includes(el)) return;
                if (multiDragSortable && multiDragSortable !== sortable) {
                    multiDragSortable.multiDrag._deselectMultiDrag();
                    multiDragSortable = sortable;
                }
                toggleClass(el, sortable.options.selectedClass, true);
                multiDragElements.push(el);
            },
            /**
             * Deselects the provided multi-drag item
             * @param  {HTMLElement} el    The element to be deselected
             */
            deselect(el) {
                let sortable = el.parentNode[expando],
                    index = multiDragElements.indexOf(el);
                if (!sortable || !sortable.options.multiDrag || !~index) return;
                toggleClass(el, sortable.options.selectedClass, false);
                multiDragElements.splice(index, 1);
            }
        },
        eventProperties() {
            const indices = []

            multiDragElements.forEach(multiDragElement => {
                // multiDragElements will already be sorted if folding
                let newIndex;
                if (folding && multiDragElement !== dragEl) {
                    newIndex = -1;
                } else if (folding) {
                    newIndex = index(multiDragElement, `:not(.${ this.options.selectedClass })`);
                } else {
                    newIndex = index(multiDragElement);
                }
                indices.push({
                    multiDragElement,
                    oldIndex: multiDragElement.sortableIndex,
                    from: multiDragElement.sortableFrom,
                    newIndex,
                });
            });
            return {
                items: [ ...multiDragElements ],
                clones: [ ...multiDragClones ],
                indices,
            };
        },
        optionListeners: {
            multiDragKey(key) {
                if (!key) return
                if (key instanceof Array) {
                    return key.map(k => {
                        k = k.toLowerCase();
                        if (k === 'ctrl') {
                            k = 'Control';
                        } else if (k.length > 1) {
                            k = `${ k.charAt(0).toUpperCase() }${ k.substring(1) }`;
                        }
                        return k
                    })
                } else {
                    key = key.toLowerCase();
                    if (key === 'ctrl') {
                        key = 'Control';
                    } else if (key.length > 1) {
                        key = `${ key.charAt(0).toUpperCase() }${ key.substring(1) }`;
                    }
                    return key;
                }
            }
        }
    });
}

const insertMultiDragElements = (clonesInserted, rootEl) => {
    multiDragElements.forEach((multiDragElement, i) => {
        let target = rootEl.children[multiDragElement.sortableIndex + (clonesInserted ? Number(i) : 0)];
        if (target) {
            rootEl.insertBefore(multiDragElement, target);
        } else {
            rootEl.appendChild(multiDragElement);
        }
    });
};

/**
 * Insert multi-drag clones
 * @param  {[Boolean]} elementsInserted  Whether the multi-drag elements are inserted
 * @param  {HTMLElement} rootEl
 */
const insertMultiDragClones = (elementsInserted, rootEl) => {
    multiDragClones.forEach((clone, i) => {
        let target = rootEl.children[clone.sortableIndex + (elementsInserted ? Number(i) : 0)];
        if (target) {
            rootEl.insertBefore(clone, target);
        } else {
            rootEl.appendChild(clone);
        }
    });
};

const removeMultiDragElements = () => {
    multiDragElements.forEach(multiDragElement => {
        if (multiDragElement === dragEl) return;
        multiDragElement.parentNode && multiDragElement.parentNode.removeChild(multiDragElement);
    });
};

export default MultiDragPlugin;
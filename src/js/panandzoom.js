import Hammer from "hammerjs";

const ua = window.navigator.userAgent,
    isWebkit = !!ua.match(/WebKit/i),
    isIOS = !!ua.match(/iP(ad|od|hone)/i), // /iPad|iPhone|iPod/.test(navigator.platform)
    isIpadOS = !!(
        navigator.maxTouchPoints &&
        navigator.maxTouchPoints > 2 &&
        /MacIntel/.test(navigator.platform)
    ),
    isMacOS = isWebkit && !isIOS && !isIpadOS,
    isChrome = !!ua.match(/Chrome/i),
    isSafari = isWebkit && (isIOS || !!ua.match(/Safari/i)) && !ua.match(/CriOS/i) && !isChrome;

class PanAndZoom {
    //overflow needs hidden

    // constants
    scale_max = 4;
    wbWidth;
    wbHeight;

    // variables
    posX = 0;
    posY = 0;
    scale = 1;
    last_posX = 0;
    last_posY = 0;
    last_scale = 1;
    max_pos_x = 0;
    max_pos_y = 0;
    min_pos_x = 0;
    min_pos_y = 0;
    scale_offset_x = 0;
    scale_offset_y = 0;
    zoom_offset_x = 0;
    zoom_offset_y = 0;
    zoom_focus_x = 0;
    zoom_focus_y = 0;
    zoom_pos_x = 0;
    zoom_pos_y = 0;
    transform = "";
    lastTool;

    parent;
    child;
    parentHammer;
    mouseOverlayHammer;
    parentWidth;
    parentHeight;
    childWidth;
    childHeight;
    el;

    constructor(parent, child, mouseOverlay, wb) {
        this.parent = parent;
        this.el = child;
        this.child = child;
        this.parentHammer = new Hammer.Manager(parent, {});
        this.mouseOverlayHammer = mouseOverlay;
        this.wb = wb;
        this.wbWidth = wb.settings["width"];
        this.wbHeight = wb.settings["height"];
        this.logZoom();
    }

    addZoomListener() {
        this.fitContainerToScreenSize();

        console.log(ua);
        console.log({
            isMacOS: isMacOS,
            iPadOS: isIpadOS,
            iOS: isIOS,
            isSafari: isSafari,
            isChrome: isChrome,
        });

        // Safari Mac
        if (isMacOS && isSafari) {
            parent.addEventListener("gesturestart", (ev) => {
                ev.preventDefault();
                this.pinchstart();
                this.applyTransform();
            });
            parent.addEventListener("gesturechange", (ev) => {
                ev.preventDefault();
                this.pinch(ev);
                this.applyTransform();
            });
            parent.addEventListener("gestureend", (ev) => {
                ev.preventDefault();
                this.pinchend();
                this.applyTransform();
            });
        }
        //window.addEventListener("scroll", (ev) => ev.preventDefault());

        this.parentHammer.add(new Hammer.Pinch({ threshold: 0, pointers: 2 }));

        this.mouseOverlayHammer.get("pan").requireFailure(this.parentHammer.get("pinch"));

        this.parentHammer.on("pinchstart", (ev) => {
            console.log("parentHammer pinchstart");
            this.pinchstart();
            this.applyTransform();
        });

        this.parentHammer.on("pinch", (ev) => {
            this.pinch();
            this.applyTransform();
        });

        this.parentHammer.on("pinchend", (ev) => {
            console.log("parentHammer pinchend");
            this.pinchend();
            this.applyTransform();
        });
    }

    addPanListener() {
        this.fitContainerToScreenSize();

        this.parentHammer.add(new Hammer.Pan({ threshold: 0 }));
        this.parentHammer.get("pan").set({
            enable: true,
            direction: Hammer.DIRECTION_ALL,
        });

        this.parentHammer.on("panstart pan panend", () => {
            this.panstart();
            this.applyTransform();
        });

        this.parentHammer.on("pan", (ev) => {
            if (this.wb.tool === "mouse") {
                this.pan(ev);
            }
            this.applyTransform();
        });

        this.parentHammer.on("panend", () => {
            this.panend();
            this.applyTransform();
        });
    }

    /* LOGGING */
    logZoom() {
        let zoomInfo = {
            //ev: ev,
            scale: this.scale,
            translate: {
                pos: { x: this.posX, y: this.posY },
                scale_offset: { x: this.scale_offset_x, y: this.scale_offset_y },
                zoom_offset: { x: this.zoom_offset_x, y: this.zoom_offset_y },
                zoom_focus: { x: this.zoom_focus_x, y: this.zoom_focus_y },
                zoom_pos: { x: this.zoom_pos_x, y: this.zoom_pos_y },
            },
            max: { x: this.max_pos_x, y: this.max_pos_y },
            min: { x: this.min_pos_x, y: this.min_pos_y },
            child: { width: this.childWidth, height: this.childHeight },
            parent: {
                width: this.parentWidth,
                height: this.parentHeight,
            },
            window: { width: window.innerWidth, height: window.innerHeight },
        };
        console.log(zoomInfo);
    }

    updateParentProps() {
        this.parentWidth = this.parent.clientWidth;
        this.parentHeight = this.parent.clientHeight;
    }
    updateChildProps() {
        this.childWidth = this.parentWidth / this.scale;
        this.childHeight = this.parentHeight / this.scale;
    }

    correctZoomPosition() {
        // offset from the position of the parent
        let offset_x = -this.zoom_focus_x; //scale_offset_x + zoom_focus_x + zoom_offset_x;
        let offset_y = -this.zoom_focus_y; //scale_offset_y + zoom_focus_y + zoom_offset_y;

        // minimum/maximum position to not pan or zoom out of the whiteboard borders
        this.max_pos_x = offset_x; //(parWidth * (scale-1))/scale;//(((scale - 1) * elWidth / 2)/scale^2); //el.clientWidth
        this.max_pos_y = offset_y; //(parHeight * (scale-1))/scale;//(((scale - 1) * elHeight / 2)/scale^2); //el.clientHeight
        this.min_pos_x = -(this.wbWidth - this.childWidth + this.zoom_focus_x); //-max_pos_x;//scale_offset_x; //el.clientWidth
        this.min_pos_y = -(this.wbHeight - this.childHeight + this.zoom_focus_y); //-max_pos_y;//scale_offset_y; //el.clientHeight

        // compare the zoom position against the minimum and maximum
        this.zoom_pos_x = this.zoom_pos_x < this.max_pos_x ? this.zoom_pos_x : this.max_pos_x;
        this.zoom_pos_x = this.zoom_pos_x > this.min_pos_x ? this.zoom_pos_x : this.min_pos_x;
        this.zoom_pos_y = this.zoom_pos_y < this.max_pos_y ? this.zoom_pos_y : this.max_pos_y;
        this.zoom_pos_y = this.zoom_pos_y > this.min_pos_y ? this.zoom_pos_y : this.min_pos_y;
    }

    fitContainerToScreenSize() {
        this.child.style.width = this.childWidth + "px";
        this.child.style.height = this.childHeight + "px";
    }

    pinchstart() {
        /*
        _this.triggerMouseOut();
        _this.triggerMouseOver();
        _this.triggerMouseMove({ offsetX: _this.prevPos.x, offsetY: _this.prevPos.y });
        */
        console.log("start");
        this.logZoom();
    }
    pinch(ev) {
        this.fitContainerToScreenSize();

        this.scale = Math.max(0.999, Math.min(this.last_scale * ev.scale, this.scale_max));

        // aligns upper left corner of the parent element with upper left corner of the child element
        this.scale_offset_x = -(((this.scale - 1) * this.childWidth) / 2 / this.scale);
        this.scale_offset_y = -(((this.scale - 1) * this.childHeight) / 2 / this.scale);

        // sets zoom to upper left corner
        this.zoom_offset_x = this.childWidth - this.childWidth / this.scale; // - (elWidth*(scale-1)*(4/7));
        this.zoom_offset_y = this.childHeight - this.childHeight / this.scale; //- (elWidth*(scale-1)*(3/7));

        // sets zoom focus to cursor position
        this.zoom_focus_x = -(ev.clientX / this.parentWidth) * (this.scale - 1) * this.childWidth;
        this.zoom_focus_y = -(ev.clientY / this.parentHeight) * (this.scale - 1) * this.childHeight;

        // v2 sets zoom focus to the middle of the whiteboard
        // this.zoom_focus_x = -(((this.scale - 1) * this.childWidth) / 2);
        // this.zoom_focus_y = -(((this.scale - 1) * this.childHeight) / 2);
        console.log(this.zoom_focus_x);

        this.correctZoomPosition();
    }
    pinchend() {
        this.last_scale = this.scale;
        this.last_posX = this.zoom_pos_x;
        this.last_posY = this.zoom_pos_y;
        //last_posX = zoom_pos_x < max_pos_x ? zoom_pos_x : max_pos_x;
        //last_posY = zoom_pos_y < max_pos_y ? zoom_pos_y : max_pos_y;
        this.logZoom();
    }

    panstart() {}
    pan(ev) {
        this.fitContainerToScreenSize();

        this.zoom_pos_x = this.last_posX + ev.deltaX / this.scale;
        this.zoom_pos_y = this.last_posY + ev.deltaY / this.scale;

        this.correctZoomPosition();
    }
    panend() {
        // last_posX = posX < max_pos_x ? posX : max_pos_x;
        // last_posY = posY < max_pos_y ? posY : max_pos_y;
        this.last_scale = this.scale;
        this.last_posX = this.zoom_pos_x;
        this.last_posY = this.zoom_pos_y;

        this.logZoom();
    }

    doubletap(ev) {
        //transform = "scale3d(2, 2, 1) " + "translate3d(0, 0, 0) ";
        //scale = 2;
        //last_scale = 2;
        console.log(
            window.getComputedStyle(el, null).getPropertyValue("-webkit-transform").toString()
        );
        try {
            if (
                window
                    .getComputedStyle(el, null)
                    .getPropertyValue("-webkit-transform")
                    .toString() != "matrix(1, 0, 0, 1, 0, 0)"
            ) {
                transform = "scale3d(1, 1, 1) " + "translate3d(0, 0, 0) ";
                this.scale = 1;
                last_scale = 1;
            }
        } catch (err) {
            console.log(err);
        }
        el.style.webkitTransform = transform;
        transform = "";
    }
    mousetouch(ev) {
        //console.log(ev);
        if (scale != 1) {
            let parWidth = parent.clientWidth / this.scale;
            let parHeight = parent.clientHeight / this.scale;
            el.style.width = parWidth + "px";
            el.style.height = parHeight + "px";
            let elWidth = el.clientWidth;
            let elHeight = el.clientHeight;
            //posX = last_posX + ev.deltaX;
            //posY = last_posY + ev.deltaY;
            max_pos_x = 10000; //(((scale - 1) * elWidth / 2)/scale^2); //el.clientWidth
            max_pos_y = 10000; //(((scale - 1) * elHeight / 2)/scale^2); //el.clientHeight
            min_pos_x = 0; //scale_offset_x; //el.clientWidth
            min_pos_y = 0; //scale_offset_y; //el.clientHeight
            if (posX > max_pos_x) {
                this.posX = max_pos_x;
            } else if (posX < min_pos_x) {
                this.posX = min_pos_x;
            } else {
                zoom_pos_x = ev.pageX * this.scale;
            }

            if (posY > max_pos_y) {
                this.posY = max_pos_y;
            } else if (posY < min_pos_y) {
                this.posY = min_pos_y;
            } else {
                zoom_pos_y = ev.pageY * this.scale;
            }

            this.posX = this.scale_offset_x + zoom_offset_x + zoom_focus_x + zoom_pos_x;
            this.posY = this.scale_offset_y + zoom_offset_y + zoom_focus_y + zoom_pos_y;
            //console.log(max_pos_x + "; " + max_pos_y);
            //console.log(posX + "; " + posY);
        }
    }
    mousetouchend(ev) {}

    applyTransform(ev) {
        let transform;
        this.posX = this.scale_offset_x + this.zoom_offset_x + this.zoom_focus_x + this.zoom_pos_x;
        this.posY = this.scale_offset_y + this.zoom_offset_y + this.zoom_focus_y + this.zoom_pos_y;

        if (this.scale !== 1) {
            transform =
                "scale3d(" +
                this.scale +
                ", " +
                this.scale +
                ", 1)" +
                "translate3d(" +
                this.posX +
                "px," +
                this.posY +
                "px, 0) ";
        } else {
            transform = "translate3d(" + this.posX + "px," + this.posY + "px, 0) ";
        }

        if (transform) {
            this.child.style.webkitTransform = transform;
            this.updateParentProps();
            this.updateChildProps();
        }
    }
}

export { PanAndZoom };

/// <reference path="../gui/project.ts" />
/// <reference path="../gui/gui.ts" />
/// <reference path="../gui/arbor/arbor.ts" />
/// <reference path="../gui/arbor/renderer.ts" />
/// <reference path="activity.ts" />
/// <reference path="fullscreen.ts" />
/// <reference path="tooltip.ts" />

module Activity {

    import dg = DependencyGraph;

    export class HmlGame extends Activity {
        
        constructor(container : string, button : string) {
            super(container, button);
        }

        onShow(configuration?) {

        }
        onHide() {

        }
    }

    class HmlGamePresenter {

        private $container : JQuery;


        /* Todo
    
            How to ensure leftProcess and right formula valid. Or just not draw until selected?
            How to ensure valid configuration
            Detect ccs changes
            Create options
            Add event handling options
            Formula subgui.
            Only allow valid transitions.
        */


        constructor(container : string) {
            this.$container = $(container);
            var c = this.$container;

        }
    }
}

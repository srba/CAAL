/// <reference path="../../lib/jquery.d.ts" />
/// <reference path="activity.ts" />
/// <reference path="../ccs/ccs.ts" />
/// <reference path="../gui/arbor/arbor.ts" />
/// <reference path="../gui/arbor/renderer.ts" />
/// <reference path="../gui/gui.ts" />
/// <reference path="../ccs/util.ts" />

module Activity {

    import ccs = CCS;
    import ProcessGraphUI = GUI.ProcessGraphUI;
    import ArborGraph = GUI.ArborGraph;
    import CCSNotationVisitor = Traverse.CCSNotationVisitor;

    function groupBy<T>(arr : T[], keyFn : (T) => any) : any {
        var groupings = {},
            key, elem, group;
        for (var i = 0; i < arr.length; i++) {
            elem = arr[i];
            key = keyFn(elem);
            group = groupings[key];
            if (!group) group = groupings[key] = [];
            group.push(elem);
        }
        return groupings;
    }

    export class Explorer extends Activity { 
        private canvas;
        private freezeBtn;
        private renderer: Renderer;
        private uiGraph: ProcessGraphUI;
        private bindedResizeFn;
        private bindedFreezeFn;
        private graph : ccs.Graph;
        private succGenerator : ccs.ProcessVisitor<ccs.TransitionSet>;
        private initialProcessName : string;
        private statusDiv;
        private notationVisitor : CCSNotationVisitor;
        private expandDepth : number = 1;

        constructor(canvas, statusDiv, freezeBtn, notationVisitor : CCSNotationVisitor) {
            super();
            this.canvas = canvas;
            this.freezeBtn = freezeBtn;
            this.statusDiv = statusDiv;
            this.notationVisitor = notationVisitor;
            this.renderer = new Renderer(canvas);
            this.uiGraph = new ArborGraph(this.renderer);
        }

        beforeShow(configuration) {
            this.clear();
            this.graph = configuration.graph;
            this.succGenerator = configuration.successorGenerator;
            this.initialProcessName = configuration.initialProcessName;
            this.expandDepth = configuration.expandDepth;
            this.clear();
            this.expand(this.graph.processByName(this.initialProcessName), 1);
        }

        afterShow(): void {
            var that = this;
            this.bindedResizeFn = this.resize.bind(this);
            $(window).on("resize", this.bindedResizeFn);
            this.uiGraph.setOnSelectListener((processId) => {
                this.expand(this.graph.processById(processId), this.expandDepth);
            });
            this.uiGraph.unfreeze();
            this.bindedFreezeFn = this.toggleFreeze.bind(this);
            $(this.freezeBtn).on("click", this.bindedFreezeFn);
            this.resize(); 
        }

        afterHide() {
            $(window).unbind("resize", this.bindedResizeFn)
            this.bindedResizeFn = null;
            $(this.freezeBtn).unbind("click", this.freezeBtn);
            this.uiGraph.clearOnSelectListener();
            this.graph = null;
            this.succGenerator = null;
        }

        private clear() : void {
            this.uiGraph.clearAll();
        }

        private toggleFreeze() {
            var $freezeBtn = $(this.freezeBtn),
                isFreezing = $freezeBtn.text() === "Unfreeze",
                newValueText = isFreezing ? "Freeze" : "Unfreeze",
                doFreeze = !isFreezing;
            $freezeBtn.text(newValueText);
            doFreeze ? this.uiGraph.freeze() : this.uiGraph.unfreeze();
        }

        private showProcess(process : ccs.Process) {
            var data;
            if (!process) throw {type: "ArgumentError", name: "Bad argument 'process'"};
            if (this.uiGraph.getProcessDataObject(process.id)) return;
            data = {label: this.labelFor(process), status: "unexpanded"};
            this.uiGraph.showProcess(process.id, data);
        }

        private labelFor(process : ccs.Process) : string{
            var label = "S" + process.id;
            if (process instanceof ccs.NamedProcess) {
                label = (<ccs.NamedProcess>process).name;
            }
            return label;
        }

        private expand(process : ccs.Process, depth) {
            if (!process) throw {type: "ArgumentError", name: "Bad argument 'process'"};
            var allTransitions = this.expandBFS(process, depth);
            this.updateStatusAreaTransitions(process, allTransitions[process.id]);
            for (var fromId in allTransitions) {
                var fromProcess = this.graph.processById(fromId);
                this.showProcess(fromProcess);
                this.showProcessAsExplored(fromProcess);
                var groupedByTargetProcessId = groupBy(allTransitions[fromId].toArray(), t => t.targetProcess.id);
                Object.keys(groupedByTargetProcessId).forEach(tProcId => {
                    var group = groupedByTargetProcessId[tProcId],
                        datas = group.map(t => { return {label: t.action.toString()}; });
                    this.showProcess(this.graph.processById(tProcId));
                    this.uiGraph.showTransitions(fromProcess.id, tProcId, datas);
                });
            }
        }

        private expandBFS(process : ccs.Process, maxDepth) {
            var result = {},
                queue = [[1, process]], //non-emptying array as queue.
                depth, qIdx, fromProcess, transitions;
            for (qIdx = 0; qIdx < queue.length; qIdx++) {
                depth = queue[qIdx][0];
                fromProcess = queue[qIdx][1];
                result[fromProcess.id] = transitions = this.succGenerator.visit(fromProcess);
                transitions.forEach(t => {
                    if (!result[t.targetProcess.id] && depth < maxDepth) {
                        queue.push([depth + 1, t.targetProcess]);
                    }
                });
            }
            return result;
        }

        private updateStatusAreaTransitions(fromProcess, transitions : ccs.Transition[]) {
            var lines = [
                "Process '" + this.labelFor(fromProcess) + "' can do the following transitions:",
                ""
            ];
            function padRight(str, n) {
                var padding = Math.max(n - str.length, 0);
                return str + Array(padding+1).join(" ");
            }
            transitions.forEach(t => {
                var text = padRight("--- " + t.action.toString(), 24) + " -->  " +
                    this.labelFor(t.targetProcess) + " = " +
                    this.notationVisitor.visit(t.targetProcess);
                lines.push(text);
            });    
            this.updateStatusArea(lines.join('\n'));                 
        }

        private updateStatusArea(preFormatted : string) {
            var $statusDiv = $(this.statusDiv),
                preElement = document.createElement("pre");
            $statusDiv.empty();
            $(preElement).text(preFormatted);
            $statusDiv.append(preElement);
        }

        private showProcessAsExplored(process : ccs.Process) : void {
            this.uiGraph.getProcessDataObject(process.id).status = "expanded";
        }

        private resize(): void {
            var width = this.canvas.parentNode.clientWidth;
            var height = this.canvas.parentNode.clientHeight;
            height = width * 4 / 10;
            this.canvas.width = width;
            this.canvas.height = height;
            this.renderer.resize(width, height);
        }
    }
}    
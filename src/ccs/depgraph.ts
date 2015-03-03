/// <reference path="ccs.ts" />
/// <reference path="hml.ts" />
/// <reference path="util.ts" />
/// <reference path="collapse.ts" />
/// <reference path="../util/array.ts" />

module DependencyGraph {

    import ccs = CCS;
    import hml = HML;

    export type Hyperedge = Array<number>;
    export type DgNodeId = number;

    function copyHyperEdges(hyperEdges : Hyperedge[]) : Hyperedge[] {
        var result = [];
        for (var i=0; i < hyperEdges.length; i++) {
            result.push(hyperEdges[i].slice(0));
        }
        return result;
    }

    export class TraceDG implements DependencyGraph {

        private nextIdx;
        private constructData = [];
        private nodes = [];
        private leftPairs = {};
        private attackSuccGen;

        constructor(leftNode, rightNode, attackSuccGen) {
            this.constructData[0] = [0, leftNode, [rightNode]];
            this.nextIdx = 1;
            this.attackSuccGen = attackSuccGen;
        }

        public getHyperEdges(identifier) : any[][] {
            var type, result;
            //Have we already built this? Then return copy of the edges.
            if (this.nodes[identifier]) {
                result = this.nodes[identifier];
            } else {
                result = this.constructNode(identifier);
            }

            return copyHyperEdges(result);
        }

        public getAllHyperEdges() : any[] {
            return undefined;
        }

        private constructNode(identifier) : any {
            var data = this.constructData[identifier];

            return this.nodes[identifier] = this.getProcessPairStates(data[1], data[2]);
        }

        private getProcessPairStates(leftProcessId, rightProcessIds) {
            var hyperedges = [];

            var leftTransitions = this.attackSuccGen.getSuccessors(leftProcessId);
            var rightTransitions = [];

            rightProcessIds.forEach(rightProcessId => {
                var succs = this.attackSuccGen.getSuccessors(rightProcessId);
                succs.forEach(succ => {rightTransitions.push(succ) });
            });
            
            leftTransitions.forEach(leftTransition => {
                var rightTargets = [];
                
                rightTransitions.forEach(rightTransition => {
                    if (rightTransition.action.equals(leftTransition.action)) {
                        rightTargets.push(parseInt(rightTransition.targetProcess.id));

                    }

                });

                if( !(rightTargets.length > 0) ) {
                    hyperedges.push([]);
                } else {

                    rightTargets.sort(function(a, b){return a-b});

                    rightTargets = ArrayUtil.removeConsecutiveDuplicates(rightTargets);

                    console.log(rightTargets);
                    console.log(rightTargets.length);

                    if(this.leftPairs[leftTransition.targetProcess.id] === undefined)
                        this.leftPairs[leftTransition.targetProcess.id] = [];

                    if(this.leftPairs[leftTransition.targetProcess.id][rightTargets.length] === undefined)
                        this.leftPairs[leftTransition.targetProcess.id][rightTargets.length] = [];
                    
                    var rightSets = this.leftPairs[leftTransition.targetProcess.id][rightTargets.length];
                    var existing = false;

                    if (rightSets) {

                        for(var n = 0; n < rightSets.length; n++) {
                            if(rightTargets.every((v,i)=> v === rightSets[n].set[i])) {
                                existing = rightSets[n].index;
                                break;
                            }
                        }
                    }

                    if (existing) {
                        hyperedges.push([existing]);                    
                    } else {
                        var newNodeIdx = this.nextIdx++;

                        var rightSet = {set: rightTargets, index: newNodeIdx};
                        
                        this.leftPairs[leftTransition.targetProcess.id][rightTargets.length].push(rightSet);

                        this.constructData[newNodeIdx] = [0, leftTransition.targetProcess.id, rightTargets];
                        
                        hyperedges.push([newNodeIdx]);
                        
                    }

                }
                
            });
            
            return hyperedges;
        }
        
    }



    export class BisimulationDG implements DependencyGraph {

        /** The dependency graph is constructed with disjunction
            as conjunction and vica versa, since bisimulation is
            maximal fixed-point. The result marking should be
            inverted **/

        private nextIdx;
        private nodes = [];
        private constructData = [];
        private leftPairs = {};
        private isFullyConstructed = false;

        constructor(private attackSuccGen : ccs.SuccessorGenerator,
                    private defendSuccGen : ccs.SuccessorGenerator,
                    leftNode, rightNode) {
            this.constructData[0] = [0, leftNode, rightNode];
            this.nextIdx = 1;
        }

        getHyperEdges(identifier : DgNodeId) : Hyperedge[] {
            var type, result;
            //Have we already built this? Then return copy of the edges.
            if (this.nodes[identifier]) {
                result = this.nodes[identifier];
            } else {
                result = this.constructNode(identifier);
            }
            return copyHyperEdges(result);
        }

        private constructNode(identifier : DgNodeId) {
            var result,
            data = this.constructData[identifier],
            type = data[0];
            if (type === 0) { //It it a pair?
                result = this.nodes[identifier] = this.getProcessPairStates(data[1], data[2]);
            } else if (type === 1) { // The left action and destination is fixed?
                result = this.nodes[identifier] = this.getNodeForLeftTransition(data);
            } else if (type === 2) { // The right action and destination is fixed?
                result = this.nodes[identifier] = this.getNodeForRightTransition(data);
            }
            return result;
        }

        getAllHyperEdges() : [DgNodeId, Hyperedge][] {
            if (!this.isFullyConstructed) {
                this.isFullyConstructed = true;
                //All nodes have ids in order of creation, thus there are no gaps.
                for (var i=0; i < this.nextIdx; i++) {
                    this.constructNode(i);
                }
            }
            var result = [];
            result.length = this.nextIdx;
            for (var i=0; i < this.nextIdx; i++) {
                result[i] = [i, copyHyperEdges(this.nodes[i])];
            }
            return result;
        }

        private getNodeForLeftTransition(data) {
            var action = data[1],
            toLeftId = data[2],
            fromRightId = data[3],
            result = [];
            // for (s, fromRightId), s ----action---> toLeftId.
            // fromRightId must be able to match.
            var rightTransitions = this.defendSuccGen.getSuccessors(fromRightId);
            rightTransitions.forEach(rightTransition => {
                var existing, toRightId;
                //Same action - possible candidate.
                if (rightTransition.action.equals(action)) {
                    toRightId = rightTransition.targetProcess.id;
                    var rightIds = this.leftPairs[toLeftId];
                    if (rightIds) {
                        existing = rightIds[toRightId];
                    }
                    //Have we already solved the resulting (s1, t1) pair?
                    if (existing) {
                        result.push(existing);
                    } else {
                        //Build the node.
                        var newIndex = this.nextIdx++;
                        if (!rightIds) this.leftPairs[toLeftId] = rightIds = {};
                        rightIds[toRightId] = newIndex
                        this.constructData[newIndex] = [0, toLeftId, toRightId];
                        result.push(newIndex);
                    }
                }
            });
            return [result];
        }

        private getNodeForRightTransition(data) {
            var action = data[1],
            toRightId = data[2],
            fromLeftId = data[3],
            result = [];
            var leftTransitions = this.defendSuccGen.getSuccessors(fromLeftId);
            leftTransitions.forEach(leftTransition => {
                var existing, toLeftId;
                if (leftTransition.action.equals(action)) {
                    toLeftId = leftTransition.targetProcess.id;
                    var rightIds = this.leftPairs[toLeftId];
                    if (rightIds) {
                        existing = rightIds[toRightId];
                    }
                    //Have we already solved the resulting (s1, t1) pair?
                    if (existing) {
                        result.push(existing);
                    } else {
                        //Build the node.
                        var newIndex = this.nextIdx++;
                        if (!rightIds) this.leftPairs[toLeftId] = rightIds = {};
                        rightIds[toRightId] = newIndex
                        this.constructData[newIndex] = [0, toLeftId, toRightId];
                        result.push(newIndex);
                    }
                }
            });
            return [result];
        }

        private getProcessPairStates(leftProcessId : ccs.ProcessId, rightProcessId : ccs.ProcessId) : Hyperedge[] {
            var hyperedges : Hyperedge[] = [];
            var leftTransitions = this.attackSuccGen.getSuccessors(leftProcessId);
            var rightTransitions = this.attackSuccGen.getSuccessors(rightProcessId);
            leftTransitions.forEach(leftTransition => {
                var newNodeIdx = this.nextIdx++;
                this.constructData[newNodeIdx] = [1, leftTransition.action, leftTransition.targetProcess.id, rightProcessId];
                hyperedges.push([newNodeIdx]);
            });
            rightTransitions.forEach(rightTransition => {
                var newNodeIdx = this.nextIdx++;
                this.constructData[newNodeIdx] = [2, rightTransition.action, rightTransition.targetProcess.id, leftProcessId];
                hyperedges.push([newNodeIdx]);
            });
            return hyperedges;
        }

        public getAttackerOptions(dgNodeId : DgNodeId) : Hyperedge[] {
            if (this.constructData[dgNodeId][0] !== 0)
                throw "Bad node for attacker options";
            
            var hyperedges = this.getHyperEdges(dgNodeId);
            
            var result = [];
            
            hyperedges.forEach(hyperedge => {
                var targetNode = hyperedge[0];
                var data = this.constructData[targetNode];
                var action = data[1].toString();
                var targetProcess = this.attackSuccGen.getProcessById(data[2]);
                var move = data[0];
                
                result.push({
                    action: action,
                    targetProcess: targetProcess,
                    nextNode: targetNode,
                    move: move
                });
            });
            
            return result;
        }
        
        public getDefenderOptions(dgNodeId : DgNodeId) {
            if (this.constructData[dgNodeId][0] === 0)
                throw "Bad node for defender options";
            
            var hyperedge = this.getHyperEdges(dgNodeId)[0];
            
            var result = [];
            
            var tcpi = this.constructData[dgNodeId][0] === 1 ? 2 : 1;
            
            hyperedge.forEach(targetNode => {
                var data = this.constructData[targetNode];
                var targetProcess = this.defendSuccGen.getProcessById(data[tcpi]);
                
                result.push({
                    targetProcess: targetProcess,
                    nextNode: targetNode
                });
            });
            
            return result;
        }
        
        getBisimulationCollapse(marking : LevelMarking) : Traverse.Collapse {

            var sets = Object.create(null);

            //Union find / disjoint-set.
            function singleton(id) {
                var o : any = {val: id, rank: 0};
                o.parent = o;
                sets[id]= o;
            }

            function findRootInternal(set) {
                if (set.parent !== set) {
                    set.parent = findRootInternal(set.parent);
                }
                return set.parent;
            }

            function findRoot(id) {
                return findRootInternal(sets[id]);
            }

            function union(pId, qId) {
                var pRoot = findRoot(pId),
                qRoot = findRoot(qId);
                if (pRoot === qRoot) return;
                if (pRoot.rank < qRoot.rank) pRoot.parent = qRoot;
                else if (pRoot.rank > qRoot.rank) qRoot.parent = pRoot;
                else {
                    qRoot.parent = pRoot;
                    ++pRoot.rank;
                }
            }

            //Apply union find algorithm
            this.constructData.forEach((pair, i) => {
                var pId, qId;
                if (pair[0] !== 0) return;
                pId = pair[1];
                qId = pair[2];
                if (!sets[pId]) singleton(pId);
                if (!sets[qId]) singleton(qId);
                //is bisimilar?
                if (marking.getMarking(i) === marking.ZERO) {
                    union(pId, qId);
                }
            });

            //Create equivalence sets
            var eqSet = {};
            Object.keys(sets).forEach(procId => {
                var reprId = getRepresentative(procId);
                (eqSet[reprId] = eqSet[reprId] || []).push(procId);
            });

            function getRepresentative(id) {
                return findRoot(id).val;
            }

            return {
                getRepresentative: getRepresentative,
                getEquivalenceSet: function(id) {
                    return eqSet[getRepresentative(id)];
                }
            }
        }

        findDistinguishingFormula(marking : LevelMarking) : hml.Formula {
            var that = this,
                formulaSet = new hml.FormulaSet(),
                trace;
            if (marking.getMarking(0) !== marking.ONE) throw "Error: Processes are bisimilar";

            function selectMinimaxLevel(node : DgNodeId) {
                var hyperEdges = that.getHyperEdges(node),
                    bestHyperEdge : Hyperedge,
                    bestNode : DgNodeId;

                //Why JavaScript... why????
                function wrapMax(a, b) {
                    return Math.max(a, b);
                }

                if (hyperEdges.length === 0) return null;
                var bestHyperEdge = ArrayUtil.selectBest(hyperEdges, (tNodesLeft, tNodesRight) => {
                    var maxLevelLeft = tNodesLeft.map(marking.getLevel).reduce(wrapMax, 1),
                        maxLevelRight = tNodesRight.map(marking.getLevel).reduce(wrapMax, 1);
                    if (maxLevelLeft < maxLevelRight) return true;
                    if (maxLevelLeft > maxLevelRight) return false;
                    return tNodesLeft.length < tNodesRight.length;
                });

                if (bestHyperEdge.length === 0) return null;

                bestNode = ArrayUtil.selectBest(bestHyperEdge, (nodeLeft, nodeRight) => {
                    return marking.getLevel(nodeLeft) < marking.getLevel(nodeRight);
                });

                return bestNode;
            }

            //We use the internal implementation details
            //Hyperedges of type 0, have hyperedges of: [ [X], [Y], [Z] ]
            //Hyperedges of type 1/2, have the form: [ [P, Q, R, S, T] ]

            var selectSuccessor = selectMinimaxLevel;

            function formulaForBranch(node : DgNodeId) : hml.Formula {
                var cData = that.constructData[node];
                if (cData[0] === 0) {
                    var selectedNode = selectSuccessor(node);
                    return formulaForBranch(selectedNode);
                } else if (cData[0] === 1) {
                    var targetPairNodes = that.getHyperEdges(node)[0];
                    var actionMatcher = new hml.SingleActionMatcher(cData[1]);
                    if (targetPairNodes.length > 0) {
                        var subFormulas = targetPairNodes.map(formulaForBranch);
                        return formulaSet.newStrongExists(actionMatcher, formulaSet.newConj(subFormulas));
                    } else {
                        return formulaSet.newStrongExists(actionMatcher, formulaSet.newTrue());
                    }
                } else {
                    var targetPairNodes = that.getHyperEdges(node)[0];
                    var actionMatcher = new hml.SingleActionMatcher(cData[1]);
                    if (targetPairNodes.length > 0) {
                        var subFormulas = targetPairNodes.map(formulaForBranch);
                        return formulaSet.newStrongForAll(actionMatcher, formulaSet.newDisj(subFormulas));
                    } else {
                        return formulaSet.newStrongForAll(actionMatcher, formulaSet.newFalse());
                    }
                }
            }
            return formulaForBranch(0);
        }
    }

    export interface PartialDependencyGraph {
        getHyperEdges(identifier : DgNodeId) : Hyperedge[];
    }

    export interface DependencyGraph extends PartialDependencyGraph {
        getHyperEdges(identifier : DgNodeId) : Hyperedge[];
        getAllHyperEdges() : [number, Hyperedge][];
    }1

    class MuCalculusMinModelCheckingDG implements PartialDependencyGraph, hml.FormulaDispatchHandler<any> {
        private TRUE_ID = 1;
        private FALSE_ID = 2;
        // the 0th index is set in the constructor.
        // nodes[1] is tt, nodes[2] is ff - described by hyper edges.
        private nodes = [ undefined, [ [] ], [ ] ];
        private constructData = {};
        private nextIdx;
        private variableEdges = {};
        private maxFixPoints = {};

        private getForNodeId;

        constructor(private strongSuccGen : ccs.SuccessorGenerator,
                    private weakSuccGen : ccs.SuccessorGenerator,
                    nodeId, private formulaSet : hml.FormulaSet, formula : hml.Formula) {
            this.constructData[0] = [nodeId, formula];
            this.nextIdx = 3;
        }

        getHyperEdges(identifier : DgNodeId) : Hyperedge[] {
            var data, nodeId, formula, result;
            if (this.nodes[identifier]) {
                result = this.nodes[identifier];
            } else {
                data = this.constructData[identifier];
                nodeId = data[0];
                formula = data[1];
                this.getForNodeId = nodeId;
                result = formula.dispatchOn(this);
                this.nodes[identifier] = result;
            }
            return copyHyperEdges(result);
        }

        dispatchDisjFormula(formula : hml.DisjFormula) {
            var hyperEdges = [];
            formula.subFormulas.forEach(subFormula => {
                var newIndex = this.nextIdx++;
                this.constructData[newIndex] = [this.getForNodeId, subFormula];
                hyperEdges.push([newIndex]);
            });
            return hyperEdges;
        }

        dispatchConjFormula(formula : hml.ConjFormula) {
            var targetNodes = [];
            formula.subFormulas.forEach(subFormula => {
                var newIndex = this.nextIdx++;
                this.constructData[newIndex] = [this.getForNodeId, subFormula];
                targetNodes.push(newIndex);
            });
            //Return single hyperedge
            return [targetNodes];
        }

        dispatchTrueFormula(formula : hml.TrueFormula) {
            return this.nodes[this.TRUE_ID];
        }

        dispatchFalseFormula(formula : hml.FalseFormula) {
            return this.nodes[this.FALSE_ID];
        }

        private existsFormula(formula, succGen : ccs.SuccessorGenerator) {
            var hyperedges = [],
            transitionSet = succGen.getSuccessors(this.getForNodeId);
            transitionSet.forEach(transition => {
                if (formula.actionMatcher.matches(transition.action)) {
                    var newIdx = this.nextIdx++;
                    this.constructData[newIdx] = [transition.targetProcess.id, formula.subFormula];
                    hyperedges.push([newIdx]);
                }
            });
            return hyperedges;            
        }

        private forallFormula(formula, succGen : ccs.SuccessorGenerator) {
            var hyperedges = [],
            transitionSet = succGen.getSuccessors(this.getForNodeId);
            transitionSet.forEach(transition => {
                if (formula.actionMatcher.matches(transition.action)) {
                    var newIdx = this.nextIdx++;
                    this.constructData[newIdx] = [transition.targetProcess.id, formula.subFormula];
                    hyperedges.push(newIdx);
                }
            });
            return [hyperedges];
        }

        dispatchStrongExistsFormula(formula : hml.StrongExistsFormula) {
            return this.existsFormula(formula, this.strongSuccGen);
        }

        dispatchStrongForAllFormula(formula : hml.StrongForAllFormula) {
            return this.forallFormula(formula, this.strongSuccGen);
        }

        dispatchWeakExistsFormula(formula : hml.WeakExistsFormula) {
            return this.existsFormula(formula, this.weakSuccGen);
        }

        dispatchWeakForAllFormula(formula : hml.WeakForAllFormula) {
            return this.forallFormula(formula, this.weakSuccGen);
        }

        dispatchMinFixedPointFormula(formula : hml.MinFixedPointFormula) {
            return formula.subFormula.dispatchOn(this);
        }

        dispatchMaxFixedPointFormula(formula : hml.MaxFixedPointFormula) {
            var maxDg = new MuCalculusMaxModelCheckingDG(this.strongSuccGen, this.weakSuccGen, this.getForNodeId, this.formulaSet, formula);
            var marking = solveMuCalculusInternal(maxDg);
            return marking.getMarking(0) === marking.ZERO ? this.nodes[this.TRUE_ID] : this.nodes[this.FALSE_ID];
        }

        dispatchVariableFormula(formula : hml.VariableFormula) {
            var key = this.getForNodeId + "@" + formula.variable;
            var variableEdge = this.variableEdges[key];
            if (variableEdge) return [[variableEdge]];
            this.variableEdges[key] = variableEdge = this.nextIdx++;
            this.constructData[variableEdge] = [this.getForNodeId, this.formulaSet.formulaByName(formula.variable)];
            return [[variableEdge]];
        }
    }

    class MuCalculusMaxModelCheckingDG implements PartialDependencyGraph, hml.FormulaDispatchHandler<any> {
        private TRUE_ID = 1;
        private FALSE_ID = 2;
        // the 0th index is set in the constructor.
        // nodes[1] is tt, nodes[2] is ff - described by hyper edges.
        private nodes = [ undefined, [ [] ], [ ] ];
        private constructData = {};
        private nextIdx;
        private variableEdges = {};
        private maxFixPoints = {};

        private getForNodeId;

        constructor(private strongSuccGen : ccs.SuccessorGenerator, 
                    private weakSuccGen : ccs.SuccessorGenerator,
                    nodeId, private formulaSet : hml.FormulaSet, formula : hml.Formula) {
            this.constructData[0] = [nodeId, formula];
            this.nextIdx = 3;
        }

        getHyperEdges(identifier : DgNodeId) : Hyperedge[] {
            var data, nodeId, formula, result;
            if (this.nodes[identifier]) {
                result = this.nodes[identifier];
            } else {
                data = this.constructData[identifier];
                nodeId = data[0];
                formula = data[1];
                //Prevents having to pass around the node identifier.
                this.getForNodeId = nodeId;
                result = formula.dispatchOn(this);
                this.nodes[identifier] = result;
            }
            return copyHyperEdges(result);
        }

        /* Remember Max fixed point - dependency graph should be "inverted" */
        dispatchDisjFormula(formula : hml.DisjFormula) {
            var targetNodes = [];
            formula.subFormulas.forEach(subFormula => {
                var newIndex = this.nextIdx++;
                this.constructData[newIndex] = [this.getForNodeId, subFormula];
                targetNodes.push(newIndex);
            });
            //Return single hyperedge
            return [targetNodes];
        }

        dispatchConjFormula(formula : hml.ConjFormula) {
            var hyperEdges = [];
            formula.subFormulas.forEach(subFormula => {
                var newIndex = this.nextIdx++;
                this.constructData[newIndex] = [this.getForNodeId, subFormula];
                hyperEdges.push([newIndex]);
            });
            return hyperEdges;
        }

        dispatchTrueFormula(formula : hml.TrueFormula) {
            return this.nodes[this.FALSE_ID];
        }

        dispatchFalseFormula(formula : hml.FalseFormula) {
            return this.nodes[this.TRUE_ID];
        }

        private existsFormula(formula : any, succGen : ccs.SuccessorGenerator) {
            var hyperedges = [],
            transitionSet = succGen.getSuccessors(this.getForNodeId);
            transitionSet.forEach(transition => {
                if (formula.actionMatcher.matches(transition.action)) {
                    var newIdx = this.nextIdx++;
                    this.constructData[newIdx] = [transition.targetProcess.id, formula.subFormula];
                    hyperedges.push(newIdx);
                }
            });
            return [hyperedges];
        }

        private forallFormula(formula : any, succGen : ccs.SuccessorGenerator) {
            var hyperedges = [],
            transitionSet = succGen.getSuccessors(this.getForNodeId);
            transitionSet.forEach(transition => {
                if (formula.actionMatcher.matches(transition.action)) {
                    var newIdx = this.nextIdx++;
                    this.constructData[newIdx] = [transition.targetProcess.id, formula.subFormula];
                    hyperedges.push([newIdx]);
                }
            });
            return hyperedges;
        }

        dispatchStrongExistsFormula(formula : hml.StrongExistsFormula) {
            return this.existsFormula(formula, this.strongSuccGen);
        }

        dispatchStrongForAllFormula(formula : hml.StrongForAllFormula) {
            return this.forallFormula(formula, this.strongSuccGen);
        }

        dispatchWeakExistsFormula(formula : hml.WeakExistsFormula) {
            return this.existsFormula(formula, this.weakSuccGen);
        }

        dispatchWeakForAllFormula(formula : hml.WeakForAllFormula) {
            return this.forallFormula(formula, this.weakSuccGen);
        }

        dispatchMinFixedPointFormula(formula : hml.MinFixedPointFormula) {
            var minDg = new MuCalculusMinModelCheckingDG(this.strongSuccGen, this.weakSuccGen, this.getForNodeId, this.formulaSet, formula);
            var marking = solveMuCalculusInternal(minDg);
            return marking.getMarking(0) === marking.ZERO ? this.nodes[this.TRUE_ID] : this.nodes[this.FALSE_ID];
        }

        dispatchMaxFixedPointFormula(formula : hml.MaxFixedPointFormula) {
            return formula.subFormula.dispatchOn(this);
        }

        dispatchVariableFormula(formula : hml.VariableFormula) {
            var key = this.getForNodeId + "@" + formula.variable;
            var variableEdge = this.variableEdges[key];
            if (variableEdge) return [[variableEdge]];
            variableEdge = this.nextIdx++;
            this.variableEdges[key] = variableEdge;
            this.constructData[variableEdge] = [this.getForNodeId, this.formulaSet.formulaByName(formula.variable)];
            return [[variableEdge]];
        }
    }

    function solveMuCalculusInternal(dg : PartialDependencyGraph) : any {
        var marking = liuSmolkaLocal2(0, dg);
        return marking;
    }

    export function solveMuCalculus(formulaSet, formula, strongSuccGen, weakSuccGen, processId) : boolean {
        var dg = new MuCalculusMinModelCheckingDG(strongSuccGen, weakSuccGen, processId, formulaSet, formula),
        marking = solveMuCalculusInternal(dg);
        return marking.getMarking(0) === marking.ONE;
    }

    export function isBisimilar(attackSuccGen : ccs.SuccessorGenerator, defendSuccGen : ccs.SuccessorGenerator, leftProcessId, rightProcessId, graph?) {
        var dg = new BisimulationDG(attackSuccGen, defendSuccGen, leftProcessId, rightProcessId),
        marking = liuSmolkaLocal2(0, dg);

        //Bisimulation is maximal fixed point, the marking is reversed.
        // if (marking.getMarking(0) === marking.ONE && graph) {
        //     var traceIterator = dg.getTraceIterator(marking)
        //     while (traceIterator.hasNext()) {
        //         var traces = traceIterator.next();            
        //         console.log("Left does: ");
        //         console.log(prettyPrintTrace(graph, traces.left));
        //         console.log("Right does: ");
        //         console.log(prettyPrintTrace(graph, traces.right));
        //     }
        // }
        return marking.getMarking(0) === marking.ZERO;
    }

    export function isTraceIncluded(attackSuccGen : ccs.SuccessorGenerator, defendSuccGen : ccs.SuccessorGenerator, leftProcessId, rightProcessId, graph?) {
        var dg = new TraceDG(leftProcessId, rightProcessId, attackSuccGen);
        
        var marking = liuSmolkaLocal2(0, dg);

        return marking.getMarking(0) === marking.ZERO;
        
    }

    export function getBisimulationCollapse(
        attackSuccGen : ccs.SuccessorGenerator,
        defendSuccGen : ccs.SuccessorGenerator,
        leftProcessId,
        rightProcessId) : Traverse.Collapse {
            var dg = new BisimulationDG(attackSuccGen, defendSuccGen, leftProcessId, rightProcessId),
            marking = liuSmolkaGlobal(dg);
            return dg.getBisimulationCollapse(marking);
        }

    function prettyPrintTrace(graph, trace) {
        var notation = new Traverse.CCSNotationVisitor(),
        stringParts = [];
        for (var i=0; i < trace.length; i++) {
            if (i % 2 == 1) stringParts.push("---- " + trace[i].toString() + " ---->");
            else stringParts.push(notation.visit(graph.processById(trace[i])));
        }
        return stringParts.join("\n\t");
    }
    
    export interface Marking {
        getMarking(any) : number;
        ZERO : number;
        ONE : number;
    }
    
    export interface LevelMarking extends Marking {
        getLevel(any) : number;
    }

    function liuSmolkaLocal2(m : DgNodeId, graph : PartialDependencyGraph) : any {
        var S_ZERO = 1, S_ONE = 2, S_BOTTOM = 3;

        // A[k]
        var A = (function () {
            var a = {};
            var o = {
                get: function(k) {
                    return a[k] || S_BOTTOM;
                },
                set: function(k, status) {
                    a[k] = status;
                },
                dump: function() {
                    return a;
                }
            };
            return o;
        }());

        // D[k]
        var D = (function () {
            var d = {};
            var o = {
                empty: function(k) {
                    d[k] = [];
                },
                add: function(k, edgeL) {
                    d[k] = d[k] || [];
                    d[k].push(edgeL);
                },
                get: function(k) {
                    return d[k] || [];
                }
            };
            return o;
        }());

        function getSucc(k) {
            return graph.getHyperEdges(k);
        }

        function load(k) {
            var l = getSucc(k);
            while (l.length > 0) {
                W.push([k, l.pop()]);
            }
        }

        A.set(m, S_ZERO);
        D.empty(m);
        var W = [];
        load(m);

        while (W.length > 0) {
            var next = W.pop();
            var k = next[0];
            var l = next[1];
            if (A.get(k) === S_ZERO) {
                if (l.length > 0) {
                    var headL = l[l.length-1];
                    while (l.length > 0 && A.get(headL) === S_ONE) {
                        l.pop();
                        headL = l[l.length-1];
                    }
                }
                if (l.length === 0) {
                    A.set(k, S_ONE);
                    W = W.concat(D.get(k));
                }
                else if (A.get(headL) === S_ZERO) {
                    D.add(headL, [k, l]);
                }
                else if (A.get(headL) === S_BOTTOM) {
                    A.set(headL, S_ZERO);
                    D.empty(headL);
                    D.add(headL, [k, l]); //Missing in smolka paper
                    load(headL);
                }
            }
        }
        return {
            getMarking: function(dgNodeId : DgNodeId) {
                return A.get(dgNodeId);
            },
            ZERO: S_ZERO,
            ONE: S_ONE,
            UNKNOWN: S_BOTTOM
        }
    }

    function liuSmolkaGlobal(graph : DependencyGraph) : any {
        var S_ZERO = 1, S_ONE = 2;
        // A[k]
        var A = (function () {
            var a = {};
            var o = {
                get: function(k) {
                    return a[k] || S_ZERO;
                },
                set: function(k, status) {
                    a[k] = status;
                }
            };
            return o;
        }());

        // D[k]
        var D = (function () {
            var d = {};
            var o = {
                empty: function(k) {
                    d[k] = [];
                },
                add: function(k, edgeL) {
                    d[k] = d[k] || [];
                    d[k].push(edgeL);
                },
                get: function(k) {
                    return d[k] || [];
                }
            };
            return o;
        }());

        var W = [];
        //Unpack hyperedges
        graph.getAllHyperEdges().forEach(pair => {
            var sourceNode = pair[0];
            pair[1].forEach(hyperEdge => W.push([sourceNode, hyperEdge]));
        });

        while (W.length > 0) {
            var next = W.pop();
            var k = next[0];
            var l = next[1];
            if (A.get(k) === S_ZERO) {
                if (l.length > 0) {
                    var headL = l[l.length-1];
                    while (l.length > 0 && A.get(headL) === S_ONE) {
                        l.pop();
                        headL = l[l.length-1];
                    }
                }
                if (l.length === 0) {
                    A.set(k, S_ONE);
                    W = W.concat(D.get(k));
                } else {
                    D.add(headL, [k, l]);
                }
            }
        }

        return {
            getMarking: function(dgNodeId : DgNodeId) {
                return A.get(dgNodeId);
            },
            ZERO: S_ZERO,
            ONE: S_ONE
        }
    }

    export function solveDgGlobalLevel(graph : DependencyGraph) : LevelMarking {
        var S_ZERO = 1, S_ONE = 2;
        // A[k]
        var Level = (function () {
            var a = {};
            var o = {
                get: function(k) {
                    return a[k] || Infinity;
                },
                set: function(k, level) {
                    a[k] = level;
                }
            };
            return o;
        }());

        // D[k]
        var D = (function () {
            var d = {};
            var o = {
                empty: function(k) {
                    d[k] = [];
                },
                add: function(k, edgeL) {
                    d[k] = d[k] || [];
                    d[k].push(edgeL);
                },
                get: function(k, level) {
                    var pairs = (d[k] || []).slice();
                    pairs.forEach(pair => pair.push(level));
                    return pairs;
                }
            };
            return o;
        }());

        var W = [];
        //Unpack hyperedges
        graph.getAllHyperEdges().forEach(pair => {
            var sourceNode = pair[0];
            pair[1].forEach(hyperEdge => W.push([sourceNode, hyperEdge, -1]));
        });
        while (W.length > 0) {
            var next = W.pop();
            var k = next[0];
            var l = next[1];
            var candidateLevel = next[2];
            var kLevel = Level.get(k);

            //First run, add deps
            if (candidateLevel === -1) {
                for (var edgeIdx = 0; edgeIdx < l.length; edgeIdx++) {
                    D.add(l[edgeIdx], [k, l]);
                }
                candidateLevel = Infinity;
            }

            if (candidateLevel < kLevel || kLevel === Infinity) {
                //Check if situation improved.
                var highestSubLevel = 0;
                for (var edgeIdx = 0; edgeIdx < l.length; edgeIdx++) {
                    var subLevel = Level.get(l[edgeIdx]);
                    highestSubLevel = Math.max(subLevel, highestSubLevel);
                    //This target node is too high level to improve "parent".
                    if (subLevel >= candidateLevel) break; 
                }
                //Went through all and improved?
                if ((edgeIdx >= l.length) && (highestSubLevel+1) < kLevel) {
                    Level.set(k, highestSubLevel+1);
                    W = W.concat(D.get(k, highestSubLevel+2));
                }
            }
        }
        return {
            getMarking: function(dgNodeId : DgNodeId) {
                return Level.get(dgNodeId) === Infinity ? S_ZERO : S_ONE;
            },
            getLevel: function(dgNodeId : DgNodeId) {
                return Level.get(dgNodeId);
            },
            ZERO: S_ZERO,
            ONE: S_ONE
        }
    }
}

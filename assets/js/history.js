// Undo and redo for the playground: a list of snapshots and a place in it. Repeats aren't steps.
(function (root) {
  'use strict';
  function create(limit = 100) {
    let steps = [], at = -1;
    return {
      push(snapshot) {
        if (steps[at] === snapshot) return;
        steps = steps.slice(0, at + 1);
        steps.push(snapshot);
        if (steps.length > limit) steps.shift();
        at = steps.length - 1;
      },
      undo() { return at > 0 ? steps[--at] : null; },
      redo() { return at < steps.length - 1 ? steps[++at] : null; },
      get canUndo() { return at > 0; },
      get canRedo() { return at < steps.length - 1; },
    };
  }
  const api = { create };
  if (typeof module !== 'undefined') module.exports = api;
  else root.PlaygroundHistory = api;
})(typeof window !== 'undefined' ? window : globalThis);

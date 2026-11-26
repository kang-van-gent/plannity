'use strict';

// Task assignment & My Tasks. /tasks/my must come before /tasks/:id routes.
module.exports = {
  routes: [
    { method: 'GET', path: '/contents/:id/tasks', handler: 'task.forContent' },
    { method: 'POST', path: '/contents/:id/tasks', handler: 'task.create' },
    { method: 'GET', path: '/tasks/my', handler: 'task.mine' },
    { method: 'GET', path: '/brands/:brandId/tasks', handler: 'task.forBrand' },
    { method: 'PATCH', path: '/tasks/:id/assignment', handler: 'task.updateAssignment' },
    { method: 'POST', path: '/tasks/:id/transition', handler: 'task.transition' },
  ],
};

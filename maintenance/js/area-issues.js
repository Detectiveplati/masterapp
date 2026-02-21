/**
 * area-issues.js
 * Shared utilities for area issue management across pages.
 */

const AREAS = [
    'Combi Oven Area',
    'Deep Frying Area',
    'Stir Frying Area',
    'Packing Area',
    'Salad Room',
    'Fruit Room',
    'Cold Room',
    'Pan Fry Area'
];

const CATEGORIES = [
    'Plumbing',
    'Electrical',
    'HVAC',
    'Structural',
    'Cleaning',
    'Safety Hazard',
    'Pest Control',
    'Other'
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const STATUSES   = ['Open', 'In Progress', 'Resolved', 'Closed'];

/** Priority badge HTML */
function priorityBadge(priority) {
    const map = {
        'Critical': 'badge-critical',
        'High':     'badge-high',
        'Medium':   'badge-medium',
        'Low':      'badge-low'
    };
    return `<span class="priority-badge ${map[priority] || 'badge-low'}">${priority || '—'}</span>`;
}

/** Status badge HTML */
function statusBadge(status) {
    const map = {
        'Open':        'status-open',
        'In Progress': 'status-inprogress',
        'Resolved':    'status-resolved',
        'Closed':      'status-closed'
    };
    return `<span class="status-badge ${map[status] || 'status-open'}">${status || '—'}</span>`;
}

/** Category icon */
function categoryIcon(category) {
    const map = {
        'Plumbing':      '🔧',
        'Electrical':    '⚡',
        'HVAC':          '🌬️',
        'Structural':    '🧱',
        'Cleaning':      '🧹',
        'Safety Hazard': '⚠️',
        'Pest Control':  '🐛',
        'Other':         '📋'
    };
    return map[category] || '📋';
}

/** Format date string */
function fmtDate(ds) {
    if (!ds) return '—';
    return new Date(ds).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Escape HTML */
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Days since date */
function daysSince(ds) {
    if (!ds) return null;
    return Math.floor((Date.now() - new Date(ds)) / 86400000);
}

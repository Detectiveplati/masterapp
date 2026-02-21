/**
 * Charts Module for Dashboard Visualizations
 * Uses Chart.js for rendering equipment and maintenance data
 */

const DashboardCharts = {
    /**
     * Create equipment status pie chart
     * @param {string} canvasId - Canvas element ID
    * @param {Object} data - Status counts {operational, needs_action}
     */
    createStatusPieChart(canvasId, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Operational', 'Needs Action'],
                datasets: [{
                    data: [
                        data.operational || 0,
                        data.needs_action || 0
                    ],
                    backgroundColor: [
                        '#27ae60',  // Green - Operational
                        '#c0392b'   // Red - Needs Action
                    ],
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: {
                                size: 12,
                                family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Equipment Status Distribution',
                        font: {
                            size: 16,
                            weight: 'bold',
                            family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                        },
                        color: '#c0392b'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Create equipment type bar chart
     * @param {string} canvasId - Canvas element ID
     * @param {Object} data - Type counts {Warmer, Chiller, Freezer, etc.}
     */
    createTypeBarChart(canvasId, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const labels = Object.keys(data);
        const values = Object.values(data);

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Equipment Count',
                    data: values,
                    backgroundColor: '#c0392b',
                    borderColor: '#a93226',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: {
                                family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Equipment by Type',
                        font: {
                            size: 16,
                            weight: 'bold',
                            family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                        },
                        color: '#c0392b'
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        titleFont: {
                            size: 14
                        },
                        bodyFont: {
                            size: 13
                        }
                    }
                }
            }
        });
    },

    /**
     * Create maintenance trend line chart
     * @param {string} canvasId - Canvas element ID
     * @param {Array} data - Array of {month, count} objects
     */
    createMaintenanceTrendChart(canvasId, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const labels = data.map(item => item.month);
        const values = data.map(item => item.count);

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Maintenance Activities',
                    data: values,
                    borderColor: '#c0392b',
                    backgroundColor: 'rgba(192, 57, 43, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#c0392b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            font: {
                                family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Maintenance Activity Trend',
                        font: {
                            size: 16,
                            weight: 'bold',
                            family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                        },
                        color: '#c0392b'
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12
                    }
                }
            }
        });
    },

    /**
     * Create cost analysis chart
     * @param {string} canvasId - Canvas element ID
     * @param {Array} data - Array of {label, partsCost, laborCost} objects
     */
    createCostChart(canvasId, data) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const labels = data.map(item => item.label);
        const partsCosts = data.map(item => item.partsCost || 0);
        const laborCosts = data.map(item => item.laborCost || 0);

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Parts Cost',
                        data: partsCosts,
                        backgroundColor: '#d35400',
                        borderRadius: 6
                    },
                    {
                        label: 'Labor Cost',
                        data: laborCosts,
                        backgroundColor: '#c0392b',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            },
                            font: {
                                family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        stacked: true,
                        ticks: {
                            font: {
                                family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 15,
                            font: {
                                family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Maintenance Costs',
                        font: {
                            size: 16,
                            weight: 'bold',
                            family: "'Bahnschrift', 'Trebuchet MS', sans-serif"
                        },
                        color: '#c0392b'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.parsed.y.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Process equipment data for charts
     * @param {Array} equipment - Array of equipment objects
     * @returns {Object} Processed data for charts
     */
    processEquipmentData(equipment) {
        // Status counts (using lowercase keys to match model enum)
        const statusCounts = {
            'operational': 0,
            'needs_action': 0
        };

        // Type counts
        const typeCounts = {};

        equipment.forEach(eq => {
            // Count statuses
            const normalizedStatus = eq.status === 'operational' ? 'operational' : 'needs_action';
            statusCounts[normalizedStatus]++;

            // Count types
            if (!typeCounts[eq.type]) {
                typeCounts[eq.type] = 0;
            }
            typeCounts[eq.type]++;
        });

        return {
            statusCounts,
            typeCounts
        };
    },

    /**
     * Process maintenance data for trend chart
     * @param {Array} maintenanceRecords - Array of maintenance record objects
     * @returns {Array} Monthly maintenance counts
     */
    processMaintenanceTrend(maintenanceRecords) {
        const monthCounts = {};
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        maintenanceRecords.forEach(record => {
            const date = new Date(record.date);
            const monthYear = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
            
            if (!monthCounts[monthYear]) {
                monthCounts[monthYear] = 0;
            }
            monthCounts[monthYear]++;
        });

        // Convert to array and get last 6 months
        const sortedData = Object.entries(monthCounts)
            .map(([month, count]) => ({ month, count }))
            .slice(-6);

        return sortedData;
    },

    /**
     * Destroy all chart instances
     * @param {Array} chartInstances - Array of Chart.js instances
     */
    destroyCharts(chartInstances) {
        chartInstances.forEach(chart => {
            if (chart) {
                chart.destroy();
            }
        });
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardCharts;
}

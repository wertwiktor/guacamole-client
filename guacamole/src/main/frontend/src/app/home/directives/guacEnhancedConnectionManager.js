/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * A directive for enhanced connection management with detailed status information.
 */
angular.module('home').directive('guacEnhancedConnectionManager', [function guacEnhancedConnectionManager() {
        
    return {
        // Element only
        restrict: 'E',
        replace: true,

        scope: {
        },

        templateUrl: 'app/home/templates/enhancedConnectionManager.html',
        controller: ['$scope', '$injector', function enhancedConnectionManagerController($scope, $injector) {
                
            // Get required types
            var Connection = $injector.get('Connection');
            var ConnectionGroup = $injector.get('ConnectionGroup');
            var GroupListItem = $injector.get('GroupListItem');
            var ActiveConnection = $injector.get('ActiveConnection');

            // Get required services
            var $filter = $injector.get('$filter');
            var $translate = $injector.get('$translate');
            var $interval = $injector.get('$interval');
            var $timeout = $injector.get('$timeout');
            var $q = $injector.get('$q');
            var $sce = $injector.get('$sce');
            var $http = $injector.get('$http');
            var authenticationService = $injector.get('authenticationService');
            var connectionService = $injector.get('connectionService');
            var connectionGroupService = $injector.get('connectionGroupService');
            var activeConnectionService = $injector.get('activeConnectionService');
            var dataSourceService = $injector.get('dataSourceService');
            var requestService = $injector.get('requestService');

            /**
             * All enhanced connection data, or null if not yet loaded.
             *
             * @type Array
             */
            $scope.enhancedConnections = null;

            /**
             * Whether the data is currently being loaded.
             *
             * @type Boolean
             */
            $scope.loading = false;

            /**
             * Whether to show the console log.
             *
             * @type Boolean
             */
            $scope.showConsole = false;

            /**
             * Console log entries.
             *
             * @type Array
             */
            $scope.consoleLog = [];

            /**
             * Auto-refresh interval in milliseconds.
             *
             * @type Number
             */
            $scope.autoRefreshInterval = 10000; // 10 seconds

            /**
             * Auto-refresh timer.
             *
             * @type Object
             */
            var autoRefreshTimer = null;

            /**
             * Log a message to the console.
             *
             * @param {String} message
             *     The message to log.
             *
             * @param {String} type
             *     The type of log entry (info, success, error, warning).
             */
            $scope.log = function log(message, type) {
                type = type || 'info';
                $scope.consoleLog.push({
                    message: message,
                    type: type,
                    timestamp: new Date().toLocaleTimeString()
                });
                
                // Keep only last 100 entries
                if ($scope.consoleLog.length > 100) {
                    $scope.consoleLog.shift();
                }
            };

            /**
             * Toggle console visibility.
             */
            $scope.toggleConsole = function toggleConsole() {
                $scope.showConsole = !$scope.showConsole;
            };

            /**
             * Copy console logs to clipboard.
             */
            $scope.copyLogs = function copyLogs() {
                try {
                    var logText = $scope.consoleLog.map(function(entry) {
                        return '[' + entry.timestamp + '] ' + entry.message;
                    }).join('\n');
                    
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        // Modern clipboard API
                        navigator.clipboard.writeText(logText).then(function() {
                            $scope.log('✅ Logs copied to clipboard!', 'success');
                        }).catch(function(err) {
                            $scope.log('❌ Failed to copy logs: ' + err.message, 'error');
                            fallbackCopyTextToClipboard(logText);
                        });
                    } else {
                        // Fallback for older browsers
                        fallbackCopyTextToClipboard(logText);
                    }
                } catch (error) {
                    $scope.log('❌ Error copying logs: ' + error.message, 'error');
                }
            };

            /**
             * Fallback method to copy text to clipboard for older browsers.
             */
            function fallbackCopyTextToClipboard(text) {
                var textArea = document.createElement("textarea");
                textArea.value = text;
                textArea.style.top = "0";
                textArea.style.left = "0";
                textArea.style.position = "fixed";
                
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                try {
                    var successful = document.execCommand('copy');
                    if (successful) {
                        $scope.log('✅ Logs copied to clipboard!', 'success');
                    } else {
                        $scope.log('❌ Failed to copy logs', 'error');
                    }
                } catch (err) {
                    $scope.log('❌ Fallback copy failed: ' + err.message, 'error');
                }
                
                document.body.removeChild(textArea);
            }

            /**
             * Get authentication token from current session.
             *
             * @returns {String}
             *     The current authentication token.
             */
            function getAuthToken() {
                return authenticationService.getCurrentToken();
            }

            /**
             * Fetch connection parameters using direct API call.
             *
             * @param {String} dataSource
             *     The data source identifier.
             *
             * @param {String} connectionId
             *     The connection identifier.
             *
             * @returns {Promise.<Object>}
             *     A promise that resolves to the connection parameters.
             */
            function fetchConnectionParameters(dataSource, connectionId) {
                var token = getAuthToken();
                var url = 'api/session/data/' + dataSource + '/connections/' + connectionId + '/parameters?token=' + encodeURIComponent(token);
                
                $scope.log('Fetching connection parameters from: ' + url, 'info');
                
                return $http.get(url).then(function(response) {
                    $scope.log('Connection parameters response for ' + connectionId + ': ' + JSON.stringify(response.data), 'info');
                    if (Object.keys(response.data).length > 0) {
                        $scope.log('Connection parameters fetched for ' + connectionId + ': ' + Object.keys(response.data).join(', '), 'success');
                    }
                    return response.data;
                }).catch(function(error) {
                    $scope.log('Failed to fetch connection parameters for ' + connectionId + ': ' + error.status + ' ' + error.statusText, 'error');
                    return {};
                });
            }

            /**
             * Fetch connection history using direct API call.
             *
             * @param {String} dataSource
             *     The data source identifier.
             *
             * @param {String} connectionId
             *     The connection identifier.
             *
             * @returns {Promise.<Array>}
             *     A promise that resolves to the connection history.
             */
            function fetchConnectionHistory(dataSource, connectionId) {
                var token = getAuthToken();
                var url = 'api/session/data/' + dataSource + '/connections/' + connectionId + '/history?token=' + encodeURIComponent(token);
                
                return $http.get(url).then(function(response) {
                    var history = response.data;
                    if (Array.isArray(history) && history.length > 0) {
                        $scope.log('Connection history fetched for ' + connectionId + ': ' + history.length + ' entries', 'success');
                    }
                    return Array.isArray(history) ? history : [];
                }).catch(function(error) {
                    $scope.log('Failed to fetch connection history for ' + connectionId + ': ' + error.status + ' ' + error.statusText, 'error');
                    return [];
                });
            }

            /**
             * Extract IP address from connection name or parameters.
             *
             * @param {String} connectionName
             *     The name of the connection.
             *
             * @param {Object} parameters
             *     The connection parameters.
             *
             * @param {String} protocol
             *     The connection protocol.
             *
             * @returns {String}
             *     The extracted IP address or 'N/A'.
             */
            function extractIPAddress(connectionName, parameters, protocol) {
                // Check if connection name is an IP address
                var ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
                if (ipRegex.test(connectionName)) {
                    return connectionName;
                }
                
                // Try to get IP from connection parameters based on protocol
                if (parameters && Object.keys(parameters).length > 0) {
                    // Protocol-specific parameter mapping
                    var parameterNames = [];
                    switch (protocol) {
                        case 'rdp':
                            parameterNames = ['hostname', 'host'];
                            break;
                        case 'vnc':
                            parameterNames = ['hostname', 'host'];
                            break;
                        case 'ssh':
                            parameterNames = ['hostname', 'host'];
                            break;
                        case 'telnet':
                            parameterNames = ['hostname', 'host'];
                            break;
                        default:
                            parameterNames = ['hostname', 'host', 'server', 'address', 'ip'];
                    }
                    
                    // Check each parameter name in order of preference
                    for (var i = 0; i < parameterNames.length; i++) {
                        var paramName = parameterNames[i];
                        if (parameters[paramName] && parameters[paramName].trim()) {
                            return parameters[paramName].trim();
                        }
                    }
                    
                    // If no standard parameters found, check for any parameter that looks like an IP
                    for (var key in parameters) {
                        if (parameters.hasOwnProperty(key) && parameters[key] && typeof parameters[key] === 'string') {
                            var value = parameters[key].trim();
                            if (ipRegex.test(value)) {
                                return value;
                            }
                        }
                    }
                }
                
                return 'N/A';
            }

            /**
             * Check machine status based on various indicators.
             *
             * @param {String} ipAddress
             *     The IP address to check.
             *
             * @param {Object} parameters
             *     The connection parameters.
             *
             * @param {Array} activeSessions
             *     The active sessions for this connection.
             *
             * @param {Array} connectionHistory
             *     The connection history.
             *
             * @returns {Object}
             *     The status object with status and text properties.
             */
            function checkMachineStatus(ipAddress, parameters, activeSessions, connectionHistory) {
                $scope.log('🔍 Checking machine status for IP: ' + ipAddress + ', activeSessions: ' + (activeSessions ? activeSessions.length : 'null'), 'info');
                
                if (!ipAddress || ipAddress === 'N/A') {
                    $scope.log('❌ No IP address available - status: Unknown', 'warning');
                    return { status: 'unknown', text: 'Unknown' };
                }
                
                // Check for active sessions first
                if (activeSessions && activeSessions.length > 0) {
                    var userCount = activeSessions.length;
                    var statusText = userCount === 1 ? '1 user online' : userCount + ' users online';
                    $scope.log('✅ Active sessions found - status: ' + statusText, 'success');
                    return { status: 'active', text: statusText };
                }



                // Method 2: Check for very recent activity (last 5 minutes) - likely still active
                if (connectionHistory && connectionHistory.length > 0) {
                    var now = new Date();
                    var fiveMinutesAgo = now.getTime() - 5 * 60 * 1000;
                    var oneHourAgo = now.getTime() - 60 * 60 * 1000;
                    var oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
                    
                    // Sort history by start date (newest first)
                    var sortedHistory = connectionHistory.sort(function(a, b) {
                        return b.startDate - a.startDate;
                    });
                    
                    var mostRecentConnection = sortedHistory[0];
                    var timeSinceLastConnection = now.getTime() - mostRecentConnection.startDate;
                    
                    // Very recent activity (within 5 minutes) - likely still connected
                    if (mostRecentConnection.startDate >= fiveMinutesAgo) {
                        return { status: 'active', text: 'Recently Active' };
                    }
                    
                    // Recent activity within 1 hour
                    if (mostRecentConnection.startDate >= oneHourAgo) {
                        return { status: 'recent', text: 'Recent (1h)' };
                    }
                    
                    // Activity within 24 hours
                    if (mostRecentConnection.startDate >= oneDayAgo) {
                        return { status: 'recent', text: 'Recent (24h)' };
                    }
                    
                    // Older activity
                    var daysAgo = Math.floor(timeSinceLastConnection / (24 * 60 * 60 * 1000));
                    if (daysAgo < 7) {
                        return { status: 'no_recent', text: daysAgo + 'd ago' };
                    } else {
                        return { status: 'no_recent', text: 'Inactive' };
                    }
                }

                // Method 3: Check if connection has valid parameters (at least reachable)
                if (parameters && parameters.hostname) {
                    return { status: 'connectable', text: 'Connectable' };
                }

                // Default to unknown
                return { status: 'unknown', text: 'Unknown' };
            }

            /**
             * Get last connection time from history and connection object.
             *
             * @param {Array} connectionHistory
             *     The connection history.
             *
             * @param {Object} connection
             *     The connection object which may have lastActive property.
             *
             * @returns {Object}
             *     The last connection time object with formatted and relative properties.
             */
            function getLastConnectionTime(connectionHistory, connection) {
                $scope.log('Getting last connection time...', 'info');
                
                var lastConnectionTime = null;
                
                // Method 1: Check connection history (most accurate)
                if (connectionHistory && Array.isArray(connectionHistory) && connectionHistory.length > 0) {
                    // Sort history by start date (newest first)
                    var sortedHistory = connectionHistory.sort(function(a, b) {
                        return b.startDate - a.startDate;
                    });
                    var mostRecent = sortedHistory[0];
                    
                    $scope.log('Most recent from history: ' + new Date(mostRecent.startDate).toISOString(), 'info');
                    lastConnectionTime = mostRecent.startDate;
                }
                
                // Method 2: Check connection's lastActive property
                if (connection && connection.lastActive) {
                    var lastActiveTime = connection.lastActive;
                    $scope.log('Last active from connection: ' + new Date(lastActiveTime).toISOString(), 'info');
                    
                    if (!lastConnectionTime || lastActiveTime > lastConnectionTime) {
                        lastConnectionTime = lastActiveTime;
                    }
                }
                
                if (lastConnectionTime) {
                    var date = new Date(lastConnectionTime);
                    var now = new Date();
                    var timeDiff = now - date;
                    var hoursAgo = Math.round(timeDiff / (1000 * 60 * 60));
                    var daysAgo = Math.round(timeDiff / (1000 * 60 * 60 * 24));
                    
                    // Format the date
                    var formattedDate = date.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    
                    // Create human-friendly relative time
                    var relativeTime = '';
                    if (hoursAgo < 1) {
                        relativeTime = 'Just now';
                    } else if (hoursAgo < 24) {
                        relativeTime = hoursAgo + ' hour' + (hoursAgo === 1 ? '' : 's') + ' ago';
                    } else if (daysAgo < 7) {
                        relativeTime = daysAgo + ' day' + (daysAgo === 1 ? '' : 's') + ' ago';
                    } else {
                        relativeTime = Math.round(daysAgo / 7) + ' week' + (Math.round(daysAgo / 7) === 1 ? '' : 's') + ' ago';
                    }
                    
                    $scope.log('Final result: ' + formattedDate + ' (' + relativeTime + ')', 'info');
                    return {
                        formatted: formattedDate,
                        relative: relativeTime,
                        timestamp: lastConnectionTime
                    };
                }
                
                $scope.log('No connection time found', 'warning');
                return {
                    formatted: 'Never',
                    relative: 'Never connected',
                    timestamp: null
                };
            }

            /**
             * Get connected IPs from active sessions.
             *
             * @param {Array} activeSessions
             *     The active sessions.
             *
             * @returns {String}
             *     The connected IPs or 'None'.
             */
            function getConnectedIPs(activeSessions) {
                if (!activeSessions || activeSessions.length === 0) {
                    return 'None';
                }
                
                var remoteHosts = activeSessions
                    .map(function(session) { return session.remoteHost; })
                    .filter(function(host) { return host && host !== 'null' && host !== 'undefined'; })
                    .filter(function(host, index, arr) { return arr.indexOf(host) === index; }); // Remove duplicates
                
                return remoteHosts.length > 0 ? remoteHosts.join(', ') : 'None';
            }

            /**
             * Sort connections by IP address.
             *
             * @param {Array} connections
             *     The connections to sort.
             *
             * @returns {Array}
             *     The sorted connections.
             */
            function sortConnectionsByIP(connections) {
                return connections.sort(function(a, b) {
                    if (a.ipAddress === 'N/A' && b.ipAddress === 'N/A') return 0;
                    if (a.ipAddress === 'N/A') return 1;
                    if (b.ipAddress === 'N/A') return -1;
                    
                    var ipA = a.ipAddress.split('.').map(Number);
                    var ipB = b.ipAddress.split('.').map(Number);
                    
                    for (var i = 0; i < 4; i++) {
                        if (ipA[i] !== ipB[i]) {
                            return ipA[i] - ipB[i];
                        }
                    }
                    return 0;
                });
            }

            /**
             * Recursively extract all connections from a connection group tree.
             *
             * @param {ConnectionGroup} group
             *     The connection group to extract connections from.
             *
             * @returns {Array}
             *     Array of all connections in the group and its descendants.
             */
            function extractConnectionsFromGroup(group) {
                var connections = [];
                
                if (!group) {
                    $scope.log('No group provided to extractConnectionsFromGroup', 'warning');
                    return connections;
                }
                
                $scope.log('Extracting connections from group: ' + (group.name || 'unnamed'), 'info');
                $scope.log('Group properties: ' + Object.keys(group), 'info');
                
                // Add connections in this group
                if (group.childConnections) {
                    $scope.log('Found ' + group.childConnections.length + ' child connections', 'info');
                    connections = connections.concat(group.childConnections);
                } else {
                    $scope.log('No childConnections property found', 'info');
                }
                
                // Recursively add connections from child groups
                if (group.childConnectionGroups) {
                    $scope.log('Found ' + group.childConnectionGroups.length + ' child connection groups', 'info');
                    group.childConnectionGroups.forEach(function(childGroup) {
                        connections = connections.concat(extractConnectionsFromGroup(childGroup));
                    });
                } else {
                    $scope.log('No childConnectionGroups property found', 'info');
                }
                
                $scope.log('Total connections extracted from this group: ' + connections.length, 'info');
                return connections;
            }

            /**
             * Load enhanced connection data.
             *
             * @param {Boolean} silent
             *     Whether to load silently (for auto-refresh).
             */
            $scope.loadEnhancedConnections = function loadEnhancedConnections(silent) {
                if (!silent) {
                    $scope.loading = true;
                    $scope.log('Starting enhanced connection load...', 'info');
                }

                // Get available data sources
                var dataSources = authenticationService.getAvailableDataSources();
                
                var allConnections = [];
                var promises = [];

                // Get connection group tree for all data sources at once (same as home page)
                var connectionTreePromise = dataSourceService.apply(
                    connectionGroupService.getConnectionGroupTree,
                    dataSources,
                    ConnectionGroup.ROOT_IDENTIFIER
                ).then(function(connectionTrees) {
                    $scope.log('Connection trees received for all data sources', 'info');
                    $scope.log('Connection tree keys: ' + Object.keys(connectionTrees || {}), 'info');
                    
                    var allConnectionsFromTrees = [];
                    
                    // Process each data source's connection tree
                    dataSources.forEach(function(dataSource) {
                        var connectionTree = connectionTrees[dataSource];
                        if (connectionTree) {
                            $scope.log('Processing connection tree for data source: ' + dataSource, 'info');
                            var connections = extractConnectionsFromGroup(connectionTree);
                            $scope.log('Found ' + connections.length + ' connections in ' + dataSource, 'success');
                            
                            // Add data source info to each connection
                            connections.forEach(function(conn) {
                                conn.dataSource = dataSource;
                            });
                            
                            allConnectionsFromTrees = allConnectionsFromTrees.concat(connections);
                        } else {
                            $scope.log('No connection tree found for data source: ' + dataSource, 'warning');
                        }
                    });
                    
                    return allConnectionsFromTrees;
                }).catch(function(error) {
                    $scope.log('Error getting connection trees: ' + error.message, 'error');
                    return [];
                });

                // Get active connections for all data sources
                var activeConnectionPromise = dataSourceService.apply(
                    activeConnectionService.getActiveConnections,
                    dataSources
                ).then(function(activeConnections) {
                    $scope.log('Found active connections for data sources: ' + Object.keys(activeConnections || {}), 'success');
                    
                    // Debug: Log active connections details
                    for (var dataSource in activeConnections) {
                        var dsActiveConnections = activeConnections[dataSource];
                        $scope.log('Active connections in ' + dataSource + ': ' + Object.keys(dsActiveConnections || {}).length, 'info');
                        
                        // Debug the actual structure
                        $scope.log('Raw active connections data for ' + dataSource + ': ' + JSON.stringify(dsActiveConnections), 'info');
                        
                        for (var connId in dsActiveConnections) {
                            var sessions = dsActiveConnections[connId];
                            $scope.log('Connection ' + connId + ' raw data: ' + JSON.stringify(sessions), 'info');
                            
                            if (sessions && sessions.length > 0) {
                                $scope.log('Connection ' + connId + ' has ' + sessions.length + ' active sessions', 'success');
                                sessions.forEach(function(session, index) {
                                    $scope.log('  Session ' + index + ': ' + JSON.stringify({
                                        identifier: session.identifier,
                                        remoteHost: session.remoteHost,
                                        username: session.username,
                                        allKeys: Object.keys(session)
                                    }), 'info');
                                });
                            } else if (sessions) {
                                $scope.log('Connection ' + connId + ' has sessions but length is: ' + sessions.length, 'warning');
                            } else {
                                $scope.log('Connection ' + connId + ' has no sessions data', 'warning');
                            }
                        }
                    }
                    
                    return activeConnections || {};
                }).catch(function(error) {
                    $scope.log('Error getting active connections: ' + error.message, 'error');
                    return {};
                });

                // Wait for both promises to resolve
                $q.all([connectionTreePromise, activeConnectionPromise]).then(function(results) {
                    var connections = results[0];
                    var activeConnections = results[1];
                    
                    $scope.log('Processing ' + connections.length + ' total connections', 'info');
                    
                    // Debug: Log connection summary
                    $scope.log('Found connections: ' + connections.map(function(conn) { 
                        return conn.name + ' (' + (conn.identifier || conn.id) + ')'; 
                    }).join(', '), 'info');
                    
                    // Filter connections to only process those with valid identifiers
                    var validConnections = connections.filter(function(conn) {
                        var connectionId = conn.identifier || conn.id;
                        if (!connectionId) {
                            $scope.log('Skipping connection ' + (conn.name || 'Unnamed Connection') + ' - no valid identifier found', 'warning');
                            return false;
                        }
                        return true;
                    });
                    
                    $scope.log('Processing ' + validConnections.length + ' valid connections out of ' + connections.length + ' total', 'info');
                    
                    // Process each valid connection
                    var connectionPromises = validConnections.map(function(conn) {
                        var connectionId = conn.identifier || conn.id;
                        var connectionName = conn.name || 'Unnamed Connection';
                        var protocol = conn.protocol || 'Unknown';
                        var dataSource = conn.dataSource;
                        
                        $scope.log('Processing connection: ' + connectionName + ' (ID: ' + connectionId + ', DataSource: ' + dataSource + ')', 'info');
                        
                        // Create GroupListItem for this connection to get access to getClientURL()
                        var groupListItem = GroupListItem.fromConnection(dataSource, conn, false, function(dataSource, connection) {
                            return activeConnections[dataSource] && activeConnections[dataSource][connection.identifier] ? activeConnections[dataSource][connection.identifier].length : 0;
                        });
                        
                        // Get connection parameters using direct API call
                        var parametersPromise = fetchConnectionParameters(dataSource, connectionId);

                        // Get connection history using direct API call
                        var historyPromise = fetchConnectionHistory(dataSource, connectionId);

                        return $q.all([parametersPromise, historyPromise]).then(function(results) {
                            var parameters = results[0];
                            var history = results[1];
                            
                            // Log only significant data
                            if (Object.keys(parameters).length > 0) {
                                $scope.log('Connection parameters loaded for ' + connectionName, 'success');
                            }
                            if (history && history.length > 0) {
                                $scope.log('Connection history loaded for ' + connectionName + ': ' + history.length + ' entries', 'success');
                            }
                            
                            // Extract IP address
                            var ipAddress = extractIPAddress(connectionName, parameters, protocol);

                            // Get active sessions for this connection
                            var activeSessions = [];
                            if (activeConnections[dataSource]) {
                                var dsActiveConnections = activeConnections[dataSource];
                                for (var sessionId in dsActiveConnections) {
                                    var session = dsActiveConnections[sessionId];
                                    // Check if this session belongs to our connection
                                    if (session && session.connectionIdentifier === connectionId) {
                                        $scope.log('✅ Found active session for ' + connectionName + ' (user: ' + session.username + ', from: ' + session.remoteHost + ')', 'success');
                                        activeSessions.push(session);
                                    }
                                }
                            }
                            
                            // Debug active sessions
                            if (activeSessions.length > 0) {
                                $scope.log('Found ' + activeSessions.length + ' active sessions for ' + connectionName, 'success');
                                activeSessions.forEach(function(session, index) {
                                    $scope.log('Session ' + index + ': ' + JSON.stringify({
                                        identifier: session.identifier,
                                        remoteHost: session.remoteHost,
                                        username: session.username,
                                        startDate: session.startDate ? new Date(session.startDate).toISOString() : 'N/A'
                                    }), 'info');
                                });
                            }

                            // Check machine status
                            var machineStatus = checkMachineStatus(ipAddress, parameters, activeSessions, history);
                            var machineStatusClass = machineStatus.status;
                            var machineStatusText = machineStatus.text;

                            // Get session status - more detailed
                            var actualActiveCount = activeSessions.length;
                            var statusClass, statusText;
                            
                            if (actualActiveCount > 0) {
                                statusClass = 'active';
                                statusText = actualActiveCount + ' Active';
                            } else {
                                // Check if there was recent activity to show "Recently Active" vs "Inactive"
                                if (history && history.length > 0) {
                                    var now = new Date();
                                    var fiveMinutesAgo = now.getTime() - 5 * 60 * 1000;
                                    var sortedHistory = history.sort(function(a, b) { return b.startDate - a.startDate; });
                                    var mostRecent = sortedHistory[0];
                                    
                                    if (mostRecent.startDate >= fiveMinutesAgo) {
                                        statusClass = 'recent';
                                        statusText = 'Recently Active';
                                    } else {
                                        statusClass = 'inactive';
                                        statusText = 'Inactive';
                                    }
                                } else {
                                    statusClass = 'inactive';
                                    statusText = 'Inactive';
                                }
                            }

                            // Get connected IPs
                            var connectedIPs = getConnectedIPs(activeSessions);

                            // Get last connection time
                            var lastConnectionTime = getLastConnectionTime(history, conn);

                            // Build actions HTML using the GroupListItem's getClientURL method
                            var clientUrl = groupListItem.getClientURL();
                            $scope.log('Generated client URL for ' + connectionName + ': ' + clientUrl, 'info');
                            
                            var actionsHtml = '<div style="display: flex; gap: 5px;">';
                            actionsHtml += '<a href="' + clientUrl + '" target="_blank" class="action-btn start-btn" title="Open connection">Connect</a>';
                            actionsHtml += '</div>';
                            
                            // Use $sce.trustAsHtml to sanitize the HTML content
                            var trustedActionsHtml = $sce.trustAsHtml(actionsHtml);
                            
                            $scope.log('Generated actions HTML for ' + connectionName + ': ' + actionsHtml, 'info');

                            return {
                                connectionName: connectionName,
                                ipAddress: ipAddress,
                                machineStatusClass: machineStatusClass,
                                machineStatusText: machineStatusText,
                                connectedIPs: connectedIPs,
                                protocol: protocol,
                                statusClass: statusClass,
                                statusText: statusText,
                                actionsHtml: trustedActionsHtml,
                                lastConnectionFormatted: lastConnectionTime.formatted,
                                lastConnectionRelative: lastConnectionTime.relative
                            };
                        });
                    });

                    return $q.all(connectionPromises);
                }).then(function(processedConnections) {
                    $scope.log('Total connections processed: ' + processedConnections.length, 'info');

                    // Sort connections by IP
                    var sortedConnections = sortConnectionsByIP(processedConnections);
                    $scope.enhancedConnections = sortedConnections;
                    
                    if (!silent) {
                        $scope.log('All connections processed successfully!', 'success');
                    }
                }).catch(function(error) {
                    if (!silent) {
                        $scope.log('Error processing connections: ' + error.message, 'error');
                    }
                }).finally(function() {
                    if (!silent) {
                        $scope.loading = false;
                    }
                });
            };

            /**
             * Start auto-refresh.
             */
            function startAutoRefresh() {
                if (autoRefreshTimer) {
                    $interval.cancel(autoRefreshTimer);
                }
                autoRefreshTimer = $interval(function() {
                    $scope.loadEnhancedConnections(true); // Silent refresh
                }, $scope.autoRefreshInterval);
                $scope.log('Auto-refresh started (every ' + ($scope.autoRefreshInterval / 1000) + ' seconds)', 'success');
            }

            /**
             * Stop auto-refresh.
             */
            function stopAutoRefresh() {
                if (autoRefreshTimer) {
                    $interval.cancel(autoRefreshTimer);
                    autoRefreshTimer = null;
                    $scope.log('Auto-refresh stopped', 'info');
                }
            }

            // Initialize
            $scope.log('🚀 Enhanced Connection Manager v2.0 loaded - NEW VERSION', 'info');
            $scope.loadEnhancedConnections();
            startAutoRefresh();

            // Cleanup on scope destroy
            $scope.$on('$destroy', function() {
                stopAutoRefresh();
            });

        }]

    };

}]);

package com.jobgenie.gateway.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.models.OpenAPI;
import reactor.core.publisher.Mono;

@RestController
@Tag(name = "Swagger UI", description = "Swagger UI for API Gateway")
public class SwaggerController {

  @Autowired private OpenAPI openAPI;

  @Autowired private ObjectMapper objectMapper;

  @GetMapping(value = "/v3/api-docs", produces = MediaType.APPLICATION_JSON_VALUE)
  @Operation(summary = "OpenAPI Specification", description = "Get the OpenAPI specification")
  public Mono<String> getOpenAPISpec() {
    try {
      String spec = objectMapper.writeValueAsString(openAPI);
      return Mono.just(spec);
    } catch (Exception e) {
      return Mono.just("{\"error\": \"Failed to generate OpenAPI spec\"}");
    }
  }

  @GetMapping(value = "/swagger-ui/index.html", produces = MediaType.TEXT_HTML_VALUE)
  @Operation(summary = "Swagger UI", description = "Get the Swagger UI interface")
  public Mono<String> swaggerUI() {
    String html =
        """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>JobGenie API Gateway - Swagger UI</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
                    .endpoint { margin: 15px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background: #fafafa; }
                    .method { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; margin-right: 10px; }
                    .get { background: #61affe; }
                    .post { background: #49cc90; }
                    .put { background: #fca130; }
                    .delete { background: #f93e3e; }
                    .url { font-family: monospace; background: #f8f9fa; padding: 5px; border-radius: 3px; }
                    .description { margin-top: 10px; color: #666; }
                    .try-btn { background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-left: 10px; }
                    .response { margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px; font-family: monospace; white-space: pre-wrap; display: none; max-height: 300px; overflow-y: auto; }
                    .loading { text-align: center; padding: 50px; }
                    .error { color: red; text-align: center; padding: 20px; }
                    .success { color: green; }
                    .tabs { display: flex; margin-bottom: 20px; border-bottom: 1px solid #ddd; }
                    .tab { padding: 10px 20px; cursor: pointer; border: 1px solid transparent; }
                    .tab.active { background: #007bff; color: white; border-color: #007bff; }
                    .tab-content { display: none; }
                    .tab-content.active { display: block; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>JobGenie API Gateway</h1>
                        <p>Interactive API Documentation</p>
                    </div>

                    <div class="tabs">
                        <div class="tab active" onclick="showTab('endpoints')">API Endpoints</div>
                        <div class="tab" onclick="showTab('info')">API Info</div>
                        <div class="tab" onclick="showTab('health')">Health Check</div>
                    </div>

                    <div id="endpoints" class="tab-content active">
                        <h2>Available Endpoints</h2>
                        <div id="endpoints-list">
                            <div class="loading">Loading endpoints...</div>
                        </div>
                    </div>

                    <div id="info" class="tab-content">
                        <h2>API Information</h2>
                        <div id="api-info">
                            <div class="loading">Loading API information...</div>
                        </div>
                    </div>

                    <div id="health" class="tab-content">
                        <h2>Health Check</h2>
                        <div id="health-status">
                            <div class="loading">Checking health status...</div>
                        </div>
                    </div>
                </div>

                <script>
                    // Tab functionality
                    function showTab(tabName) {
                        // Hide all tab contents
                        document.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.remove('active');
                        });
                        document.querySelectorAll('.tab').forEach(tab => {
                            tab.classList.remove('active');
                        });

                        // Show selected tab
                        document.getElementById(tabName).classList.add('active');
                        event.target.classList.add('active');

                        // Load content if needed
                        if (tabName === 'endpoints' && !endpointsLoaded) {
                            loadEndpoints();
                        } else if (tabName === 'info' && !infoLoaded) {
                            loadApiInfo();
                        } else if (tabName === 'health' && !healthLoaded) {
                            loadHealthStatus();
                        }
                    }

                    let endpointsLoaded = false;
                    let infoLoaded = false;
                    let healthLoaded = false;

                    // Load API endpoints
                    function loadEndpoints() {
                        fetch('/v3/api-docs')
                            .then(response => response.json())
                            .then(spec => {
                                const endpointsList = document.getElementById('endpoints-list');
                                endpointsList.innerHTML = '';

                                if (spec.paths) {
                                    Object.keys(spec.paths).forEach(path => {
                                        const pathObj = spec.paths[path];
                                        Object.keys(pathObj).forEach(method => {
                                            const operation = pathObj[method];
                                            const endpointDiv = document.createElement('div');
                                            endpointDiv.className = 'endpoint';

                                            const methodSpan = document.createElement('span');
                                            methodSpan.className = 'method ' + method.toLowerCase();
                                            methodSpan.textContent = method.toUpperCase();

                                            const urlSpan = document.createElement('span');
                                            urlSpan.className = 'url';
                                            urlSpan.textContent = path;

                                            const tryBtn = document.createElement('button');
                                            tryBtn.className = 'try-btn';
                                            tryBtn.textContent = 'Try it';
                                            tryBtn.onclick = () => tryEndpoint(method, path, endpointDiv);

                                            const descriptionDiv = document.createElement('div');
                                            descriptionDiv.className = 'description';
                                            descriptionDiv.textContent = operation.summary || operation.description || 'No description available';

                                            const responseDiv = document.createElement('div');
                                            responseDiv.className = 'response';

                                            endpointDiv.appendChild(methodSpan);
                                            endpointDiv.appendChild(urlSpan);
                                            endpointDiv.appendChild(tryBtn);
                                            endpointDiv.appendChild(descriptionDiv);
                                            endpointDiv.appendChild(responseDiv);

                                            endpointsList.appendChild(endpointDiv);
                                        });
                                    });
                                }
                                endpointsLoaded = true;
                            })
                            .catch(error => {
                                document.getElementById('endpoints-list').innerHTML =
                                    '<div class="error">Error loading endpoints: ' + error.message + '</div>';
                            });
                    }

                    // Load API information
                    function loadApiInfo() {
                        fetch('/v3/api-docs')
                            .then(response => response.json())
                            .then(spec => {
                                const apiInfo = document.getElementById('api-info');
                                apiInfo.innerHTML = `
                                    <div class="endpoint">
                                        <h3>${spec.info.title}</h3>
                                        <p><strong>Description:</strong> ${spec.info.description || 'No description'}</p>
                                        <p><strong>Version:</strong> ${spec.info.version || 'No version'}</p>
                                        <p><strong>Contact:</strong> ${spec.info.contact ? spec.info.contact.email || 'No contact' : 'No contact'}</p>
                                        <p><strong>License:</strong> ${spec.info.license ? spec.info.license.name || 'No license' : 'No license'}</p>
                                    </div>
                                `;
                                infoLoaded = true;
                            })
                            .catch(error => {
                                document.getElementById('api-info').innerHTML =
                                    '<div class="error">Error loading API info: ' + error.message + '</div>';
                            });
                    }

                    // Load health status
                    function loadHealthStatus() {
                        fetch('/api/health')
                            .then(response => response.json())
                            .then(health => {
                                const healthStatus = document.getElementById('health-status');
                                const statusClass = health.status === 'UP' ? 'success' : 'error';
                                healthStatus.innerHTML = `
                                    <div class="endpoint">
                                        <h3>Gateway Status: <span class="${statusClass}">${health.status}</span></h3>
                                        <p><strong>Service:</strong> ${health.service}</p>
                                        <p><strong>Timestamp:</strong> ${health.timestamp}</p>
                                        <p><strong>Version:</strong> ${health.version}</p>
                                        <p><strong>Environment:</strong> ${health.environment}</p>
                                    </div>
                                `;
                                healthLoaded = true;
                            })
                            .catch(error => {
                                document.getElementById('health-status').innerHTML =
                                    '<div class="error">Error loading health status: ' + error.message + '</div>';
                            });
                    }

                    function tryEndpoint(method, path, endpointDiv) {
                        const responseDiv = endpointDiv.querySelector('.response');
                        responseDiv.style.display = 'block';
                        responseDiv.textContent = 'Loading...';

                        const url = path.startsWith('http') ? path : window.location.origin + path;

                        fetch(url, {
                            method: method.toUpperCase(),
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })
                        .then(response => {
                            const contentType = response.headers.get('content-type');
                            if (contentType && contentType.includes('application/json')) {
                                return response.json().then(data => JSON.stringify(data, null, 2));
                            } else {
                                return response.text();
                            }
                        })
                        .then(data => {
                            responseDiv.textContent = 'Response:\n' + data;
                        })
                        .catch(error => {
                            responseDiv.textContent = 'Error: ' + error.message;
                        });
                    }

                    // Load initial content
                    loadEndpoints();
                </script>
            </body>
            </html>
            """;
    return Mono.just(html);
  }

  @GetMapping(value = "/swagger-ui.html", produces = MediaType.TEXT_HTML_VALUE)
  @Operation(
      summary = "Swagger UI (Legacy)",
      description = "Get the Swagger UI interface (legacy path)")
  public Mono<String> swaggerUILegacy() {
    return swaggerUI();
  }

  @GetMapping(value = "/swagger-ui-simple", produces = MediaType.TEXT_HTML_VALUE)
  @Operation(summary = "Simple Swagger UI", description = "Alternative Swagger UI implementation")
  public Mono<String> swaggerUISimple() {
    String html =
        """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>JobGenie API Gateway - Simple Swagger UI</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
                    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
                    .endpoint { margin: 15px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background: #fafafa; }
                    .method { display: inline-block; padding: 5px 10px; border-radius: 3px; color: white; font-weight: bold; margin-right: 10px; }
                    .get { background: #61affe; }
                    .post { background: #49cc90; }
                    .put { background: #fca130; }
                    .delete { background: #f93e3e; }
                    .url { font-family: monospace; background: #f8f9fa; padding: 5px; border-radius: 3px; }
                    .description { margin-top: 10px; color: #666; }
                    .try-btn { background: #007bff; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-left: 10px; }
                    .response { margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px; font-family: monospace; white-space: pre-wrap; display: none; max-height: 300px; overflow-y: auto; }
                    .loading { text-align: center; padding: 50px; }
                    .error { color: red; text-align: center; padding: 20px; }
                    .success { color: green; }
                    .tabs { display: flex; margin-bottom: 20px; border-bottom: 1px solid #ddd; }
                    .tab { padding: 10px 20px; cursor: pointer; border: 1px solid transparent; }
                    .tab.active { background: #007bff; color: white; border-color: #007bff; }
                    .tab-content { display: none; }
                    .tab-content.active { display: block; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>JobGenie API Gateway</h1>
                        <p>Interactive API Documentation</p>
                    </div>

                    <div class="tabs">
                        <div class="tab active" onclick="showTab('endpoints')">API Endpoints</div>
                        <div class="tab" onclick="showTab('info')">API Info</div>
                        <div class="tab" onclick="showTab('health')">Health Check</div>
                    </div>

                    <div id="endpoints" class="tab-content active">
                        <h2>Available Endpoints</h2>
                        <div id="endpoints-list">
                            <div class="loading">Loading endpoints...</div>
                        </div>
                    </div>

                    <div id="info" class="tab-content">
                        <h2>API Information</h2>
                        <div id="api-info">
                            <div class="loading">Loading API information...</div>
                        </div>
                    </div>

                    <div id="health" class="tab-content">
                        <h2>Health Check</h2>
                        <div id="health-status">
                            <div class="loading">Checking health status...</div>
                        </div>
                    </div>
                </div>

                <script>
                    // Tab functionality
                    function showTab(tabName) {
                        // Hide all tab contents
                        document.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.remove('active');
                        });
                        document.querySelectorAll('.tab').forEach(tab => {
                            tab.classList.remove('active');
                        });

                        // Show selected tab
                        document.getElementById(tabName).classList.add('active');
                        event.target.classList.add('active');

                        // Load content if needed
                        if (tabName === 'endpoints' && !endpointsLoaded) {
                            loadEndpoints();
                        } else if (tabName === 'info' && !infoLoaded) {
                            loadApiInfo();
                        } else if (tabName === 'health' && !healthLoaded) {
                            loadHealthStatus();
                        }
                    }

                    let endpointsLoaded = false;
                    let infoLoaded = false;
                    let healthLoaded = false;

                    // Load API endpoints
                    function loadEndpoints() {
                        fetch('/v3/api-docs')
                            .then(response => response.json())
                            .then(spec => {
                                const endpointsList = document.getElementById('endpoints-list');
                                endpointsList.innerHTML = '';

                                if (spec.paths) {
                                    Object.keys(spec.paths).forEach(path => {
                                        const pathObj = spec.paths[path];
                                        Object.keys(pathObj).forEach(method => {
                                            const operation = pathObj[method];
                                            const endpointDiv = document.createElement('div');
                                            endpointDiv.className = 'endpoint';

                                            const methodSpan = document.createElement('span');
                                            methodSpan.className = 'method ' + method.toLowerCase();
                                            methodSpan.textContent = method.toUpperCase();

                                            const urlSpan = document.createElement('span');
                                            urlSpan.className = 'url';
                                            urlSpan.textContent = path;

                                            const tryBtn = document.createElement('button');
                                            tryBtn.className = 'try-btn';
                                            tryBtn.textContent = 'Try it';
                                            tryBtn.onclick = () => tryEndpoint(method, path, endpointDiv);

                                            const descriptionDiv = document.createElement('div');
                                            descriptionDiv.className = 'description';
                                            descriptionDiv.textContent = operation.summary || operation.description || 'No description available';

                                            const responseDiv = document.createElement('div');
                                            responseDiv.className = 'response';

                                            endpointDiv.appendChild(methodSpan);
                                            endpointDiv.appendChild(urlSpan);
                                            endpointDiv.appendChild(tryBtn);
                                            endpointDiv.appendChild(descriptionDiv);
                                            endpointDiv.appendChild(responseDiv);

                                            endpointsList.appendChild(endpointDiv);
                                        });
                                    });
                                }
                                endpointsLoaded = true;
                            })
                            .catch(error => {
                                document.getElementById('endpoints-list').innerHTML =
                                    '<div class="error">Error loading endpoints: ' + error.message + '</div>';
                            });
                    }

                    // Load API information
                    function loadApiInfo() {
                        fetch('/v3/api-docs')
                            .then(response => response.json())
                            .then(spec => {
                                const apiInfo = document.getElementById('api-info');
                                apiInfo.innerHTML = `
                                    <div class="endpoint">
                                        <h3>${spec.info.title}</h3>
                                        <p><strong>Description:</strong> ${spec.info.description || 'No description'}</p>
                                        <p><strong>Version:</strong> ${spec.info.version || 'No version'}</p>
                                        <p><strong>Contact:</strong> ${spec.info.contact ? spec.info.contact.email || 'No contact' : 'No contact'}</p>
                                        <p><strong>License:</strong> ${spec.info.license ? spec.info.license.name || 'No license' : 'No license'}</p>
                                    </div>
                                `;
                                infoLoaded = true;
                            })
                            .catch(error => {
                                document.getElementById('api-info').innerHTML =
                                    '<div class="error">Error loading API info: ' + error.message + '</div>';
                            });
                    }

                    // Load health status
                    function loadHealthStatus() {
                        fetch('/api/health')
                            .then(response => response.json())
                            .then(health => {
                                const healthStatus = document.getElementById('health-status');
                                const statusClass = health.status === 'UP' ? 'success' : 'error';
                                healthStatus.innerHTML = `
                                    <div class="endpoint">
                                        <h3>Gateway Status: <span class="${statusClass}">${health.status}</span></h3>
                                        <p><strong>Service:</strong> ${health.service}</p>
                                        <p><strong>Timestamp:</strong> ${health.timestamp}</p>
                                        <p><strong>Version:</strong> ${health.version}</p>
                                        <p><strong>Environment:</strong> ${health.environment}</p>
                                    </div>
                                `;
                                healthLoaded = true;
                            })
                            .catch(error => {
                                document.getElementById('health-status').innerHTML =
                                    '<div class="error">Error loading health status: ' + error.message + '</div>';
                            });
                    }

                    function tryEndpoint(method, path, endpointDiv) {
                        const responseDiv = endpointDiv.querySelector('.response');
                        responseDiv.style.display = 'block';
                        responseDiv.textContent = 'Loading...';

                        const url = path.startsWith('http') ? path : window.location.origin + path;

                        fetch(url, {
                            method: method.toUpperCase(),
                            headers: {
                                'Content-Type': 'application/json'
                            }
                        })
                        .then(response => {
                            const contentType = response.headers.get('content-type');
                            if (contentType && contentType.includes('application/json')) {
                                return response.json().then(data => JSON.stringify(data, null, 2));
                            } else {
                                return response.text();
                            }
                        })
                        .then(data => {
                            responseDiv.textContent = 'Response:\n' + data;
                        })
                        .catch(error => {
                            responseDiv.textContent = 'Error: ' + error.message;
                        });
                    }

                    // Load initial content
                    loadEndpoints();
                </script>
            </body>
            </html>
            """;
    return Mono.just(html);
  }

  @GetMapping(value = "/api-docs", produces = MediaType.TEXT_HTML_VALUE)
  @Operation(summary = "API Documentation", description = "Simple API documentation page")
  public Mono<String> apiDocs() {
    String html =
        """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>JobGenie API Gateway - Documentation</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                    .container { max-width: 800px; margin: 0 auto; }
                    .header { background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 30px; }
                    .endpoint { background: #fff; border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
                    .method { font-weight: bold; color: #007bff; }
                    .url { font-family: monospace; background: #f8f9fa; padding: 2px 5px; border-radius: 3px; }
                    .description { color: #666; margin-top: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>JobGenie API Gateway</h1>
                        <p>API Gateway for JobGenie Microservices - Routes requests to appropriate services</p>
                    </div>

                    <h2>Available Endpoints</h2>

                    <div class="endpoint">
                        <div class="method">GET</div>
                        <div class="url">/api/health</div>
                        <div class="description">Check the health status of the API Gateway</div>
                    </div>

                    <div class="endpoint">
                        <div class="method">GET</div>
                        <div class="url">/api/health/ping</div>
                        <div class="description">Simple ping endpoint to test connectivity</div>
                    </div>

                    <div class="endpoint">
                        <div class="method">GET</div>
                        <div class="url">/v3/api-docs</div>
                        <div class="description">OpenAPI specification in JSON format</div>
                    </div>

                    <div class="endpoint">
                        <div class="method">GET</div>
                        <div class="url">/swagger-ui/index.html</div>
                        <div class="description">Interactive Swagger UI documentation</div>
                    </div>

                    <div class="endpoint">
                        <div class="method">GET</div>
                        <div class="url">/api/docs/routes</div>
                        <div class="description">API Gateway route information</div>
                    </div>

                    <h2>Microservice Routes</h2>
                    <p>The API Gateway routes requests to the following microservices:</p>
                    <ul>
                        <li><strong>User Service:</strong> /api/users/** → user-service</li>
                        <li><strong>Job Service:</strong> /api/jobs/** → job-service</li>
                        <li><strong>Resume Service:</strong> /api/resumes/** → resume-service</li>
                        <li><strong>Notification Service:</strong> /api/notifications-backend/** → notification-service</li>
                    </ul>

                    <p><a href="/swagger-ui/index.html">View Interactive Documentation</a></p>
                </div>
            </body>
            </html>
            """;
    return Mono.just(html);
  }
}

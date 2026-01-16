import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'

export interface RouteHandler {
	(req: IncomingMessage): Promise<{ status: number; body: unknown }>
}

export interface MockServerConfig {
	port: number
	routes: {
		'/resources/cli-auth/start'?: RouteHandler
		'/resources/cli-auth/status'?: RouteHandler
	}
}

export function createMockServer(config: MockServerConfig): Server {
	const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
		const url = new URL(req.url!, `http://localhost:${config.port}`)
		const pathname = url.pathname as keyof typeof config.routes

		const handler = config.routes[pathname]
		if (handler) {
			// Handler invocation is a boundary call - catch exactly once
			// and convert to HTTP 500 response (expected mock server behavior)
			try {
				const { status, body } = await handler(req)
				res.writeHead(status, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify(body))
			} catch (error) {
				// Log for test debugging, but don't crash the server
				console.error('Mock server handler error:', error)
				res.writeHead(500, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify({ error: 'Internal server error' }))
			}
		} else {
			res.writeHead(404)
			res.end()
		}
	})

	return server
}

export function startServer(server: Server, port: number): Promise<void> {
	return new Promise((resolve) => {
		server.listen(port, resolve)
	})
}

export function stopServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((err) => {
			if (err) reject(err)
			else resolve()
		})
	})
}

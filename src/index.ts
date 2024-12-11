import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'
// import { authorizer, createSubjects } from '@openauthjs/openauth';
// import { CloudflareStorage } from '@openauthjs/openauth/storage/cloudflare';
// import { PasswordAdapter } from '@openauthjs/openauth/adapter/password';
// import { PasswordUI } from '@openauthjs/openauth/ui/password';
// import { object, set, string } from 'valibot';
import CLAUDE_SYSTEM_PROMPT from './system-prompt.txt'

const CURRENT_SESSION = 'CURRENT_SESSION'

type State = {
  session_created_at: string
  user_name: string
  home_locale: string
}

export class Session extends DurableObject<Env> {
  storage = this.ctx.storage

  async sayHello(name: string): Promise<string> {
    return `Hello, ${name}!`
  }

  async init() {
    this.storage.put<State>('state', {
      session_created_at: new Date().toString(),
      user_name: 'Glen Maddern', //todo: parameterise
      home_locale: 'Melbourne/Australia',
    })
  }

  async onMessage(message: string) {
    console.log({ message })
    if (message === 'debug') {
      return `\`${JSON.stringify(await this.storage.get('state'))}\``
    }
    if (message === 'throw') {
      throw new Error(`wtf mate?`)
    }

    const messages = [
      { role: 'system', content: await this.#getSystemPrompt() },
      { role: 'user', content: message },
    ]

    const response = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages,
      // stream: true,
    })
    console.log({ response })

    return 'response' in response ? response.response : response
  }

  async #getSystemPrompt() {
    const { session_created_at, user_name, home_locale } = (await this.storage.get<State>('state')) || {}
    return [
      CLAUDE_SYSTEM_PROMPT.replace(`{{currentDateTime}}`, new Date().toString())
        .replace(/Claude/g, 'Flaude')
        .replace(/Anthropic/g, 'GMadthropic'),
      `For context, you are talking to ${user_name}, who normally resides in ${home_locale}. This conversation started at ${session_created_at}.`,
    ].join('\n\n')
  }
}

export default class Stub404 extends WorkerEntrypoint<Env> {
  async fetch() {
    // await this.env.GCHAT_ROOM.sendMessage("Wow, I just sent a message from a Worker to Google Chat!!")
    // return new Response('XAB! It works!');

    return new Response(null, { status: 404 })
  }
}

export class ChatEvents extends WorkerEntrypoint<Env> {
  async onMessage(message: string) {
    console.log({ message, env: Object.keys(this.env) })
    const { FlaudeStorage: KV, SESSIONS: DO } = this.env

    if (message === 'clear') {
      return '-' + new Array(64).fill('\n').join('') + '-'
    }

    if (message === 'new session') {
      const id = DO.newUniqueId()
      await DO.get(id).init()
      const sessionID = id.toString()

      await KV.put(CURRENT_SESSION, sessionID)
      return `Created session \`${sessionID}\` and switched to it.`
    }

    const setSession = message.match(/^set session (\w+)\s*$/)
    if (setSession) {
      const sessionID = setSession[1]
      await KV.put(CURRENT_SESSION, sessionID)
      return `Switched to session \`${sessionID}\`.`
    }

    const currentSession = await KV.get(CURRENT_SESSION)

    if (message === 'end session') {
      await KV.delete(CURRENT_SESSION)
      return `Ended session${currentSession ? ' `' + currentSession + '`' : ''}.`
    }

    if (!currentSession) {
      return `No current session!`
    }

    try {
      const stub = DO.get(DO.idFromString(currentSession))
      const response = await stub.onMessage(message)
      console.log({ response })
      return response
    } catch (e) {
      return `⚠️ ERROR: ${(e as Error).message} [${JSON.stringify((e as Error).stack)}]`
    }
  }
}

// export default {
// 	async fetch(request, env): Promise<Response> {
//
// 		const messages = [
// 			{ role: "system", content: "You are a friendly assistant" },
// 			{
// 				role: "user",
// 				content: "What is the origin of the phrase Hello, World",
// 			},
// 		];
//
// 		const stream = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
// 			messages,
// 			stream: true,
// 		});
//
// 		return new Response(stream, {
// 			headers: { "content-type": "text/event-stream" },
// 		});
// 	},
// } satisfies ExportedHandler<Env>;

// export const subjects = createSubjects({
// 	user: object({
// 		email: string(),
// 	}),
// })
//
// export default {
// 	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
// 		return authorizer({
// 			storage: CloudflareStorage({
// 				namespace: env.CloudflareAuthKV,
// 			}),
// 			subjects,
// 			providers: {
// 				password: PasswordAdapter(
// 					PasswordUI({
// 						sendCode: async (email, code) => {
// 							console.log(email, code)
// 						},
// 					}),
// 				),
// 			},
// 			success: async (ctx, value) => {
// 				if (value.provider === "password") {
// 					return ctx.subject("user", {
// 						email: value.email,
// 					})
// 				}
// 				throw new Error("Invalid provider")
// 			},
// 		}).fetch(request, env, ctx)
// 	},
// }

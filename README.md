# kitsune

Replace your ugly CDN urls with something nice and custom. Built with Hono and Cloudflare.

![Kitsune Demo Gif](https://github.com/kkrishguptaa/kitsune/raw/HEAD/.github/kitsune.gif)

## Technologies Used

1. Hono - A small, simple, and ultra-fast web framework for Cloudflare Workers.
2. React (`hono/jsx`) - For building the user interface of the dashboard and login pages.
3. Tailwind CSS - For styling the dashboard and login pages.
4. Cloudflare Workers - For deploying the application on the edge.
5. Cloudflare KV - For storing user credentials and session tokens securely.

## What exactly does it do?

1. You have an ugly CDN url like `https://cdn.hackclub.com/019ce8b0-fb51-77e1-b026-755feddd406b/067A4083.webp`, and you want to replace it with something like `https://cdn.yourdomain.com/image.webp`.

2. You can set up a custom domain (e.g., `cdn.yourdomain.com`) to point to your Cloudflare Worker.

3. You upload the file through the dashboard, and it gives you a nice URL like `https://cdn.yourdomain.com/cdn/:id_you_give_to_kitsune`.

4. When someone accesses that URL, Kitsune fetches the file from the original CDN and serves it to the user.

## Setup Instructions

1. Clone the repository and navigate to the project directory.

2. Install the dependencies:

   ```bash
   pnpm install
   ```

3. Create a `.dev.vars` file in the root of the project and add your Admin credentials:

   ```env
    ADMIN_USERNAME=your_username
    ADMIN_PASSWORD=your_password # generate a hash of your password using `bun scripts/pwdgen.ts your_password` and use the hash here for better security
    AUTH_SECRET=some_random_secret_for_jwt
   ```

4. Create a KV namespace in your Cloudflare dashboard and add the binding to `wrangler.json`:

   ```json
   {
     "kv_namespaces": [
       {
         "binding": "db",
         "id": "your_kv_namespace_id"
       }
     ]
   }
   ```

5. Setup file uploads, `src/lib/storage.ts` is where the file upload logic exists. I'm using `cdn.hackclub.com`, which is a CDN for teenage hackers (members of Hack Club). You can replace it with your own storage solution if you want. Just make sure to update the function to return the URL of the uploaded file.

6. Add whatever credentials you need for the storage solution in the `.dev.vars` file and access them in `src/lib/storage.ts`.

7. Run the development server:

   ```bash
   pnpx wrangler dev # this is important, otherwise the cloudflare KV binding won't work
   ```

8. To deploy, remember to put the .dev.vars values in the Cloudflare dashboard as environment variables, and then run:

   ```bash
   pnpx wrangler deploy
   ```

## Suggestions for Users

I have a sister project named [imajesus](https://github.com/kkrishguptaa/imajesus).

It is a CLI tool that will make your images like 90% smaller using `webp` format. You can use it to compress your images before uploading them to Kitsune to save bandwidth and make them load faster.

## Future Improvements

1. Make kitsune compress the files before serving them to save bandwidth and make them load faster.

2. Suggest more features through issues!

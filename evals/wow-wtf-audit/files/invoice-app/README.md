# Kwit

Kwit is a small invoicing app for freelancers.
It is made for a freelancer who sends a few invoices a month.
The core job is to create an invoice and get a link to send to the client, in about a minute.
Amounts are in PLN and shown as `zł`.

## Run it

You need Node 22 or newer.
There is nothing to install.

```
make dev
```

Then open http://localhost:4173 in a browser.
Set the `PORT` environment variable to use a different port.

## Demo account

- Email: `demo@kwit.example`
- Password: `demo-password-1`

You can also sign up with any `@example.com` address.
All data lives in memory and resets when the server restarts.

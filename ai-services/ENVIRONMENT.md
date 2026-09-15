# Cloud Run environment contracts

Every service under this directory runs on Cloud Run. The `.env.example` in
each service directory documents its build-time and runtime configuration; the
VM backend and frontend do not load these files.

- Configure ordinary runtime values on the corresponding Cloud Run service.
- Configure credentials and API tokens with Secret Manager references.
- Use a local `.env` only when running that AI service directly for debugging.
- Never copy AI-service model paths, hashes, or provider secrets into the VM
  backend environment unless the backend code consumes that variable itself.

The VM and local Django processes need only the service URL, timeout, and ID
token switch documented in `backend/.env.example`.

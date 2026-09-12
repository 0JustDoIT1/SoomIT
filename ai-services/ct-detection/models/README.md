# Model checkpoint

Place `best_val_loss.pt` in this directory before building the image.

Expected SHA-256:

`4d1036ba7bdb7aec132d13ce8d0b760d277146e48511d459e6379c0651d1a009`

The service verifies this digest before loading the model. The checkpoint is
ignored by Git and must be supplied through the deployment artifact process.

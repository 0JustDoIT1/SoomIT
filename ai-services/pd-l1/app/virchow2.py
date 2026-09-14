
import torch
import timm

from timm.layers import SwiGLUPacked
from timm.data import resolve_data_config
from timm.data.transforms_factory import create_transform


MODEL_NAME = "hf-hub:paige-ai/Virchow2"


def load_virchow2(device=None):

    if device is None:
        device = torch.device(
            "cuda"
            if torch.cuda.is_available()
            else "cpu"
        )

    device = torch.device(device)
    model = timm.create_model(
        MODEL_NAME,
        pretrained=True,
        mlp_layer=SwiGLUPacked,
        act_layer=torch.nn.SiLU
    )

    model = model.eval().to(device)

    transform = create_transform(
        **resolve_data_config(
            model.pretrained_cfg,
            model=model
        )
    )

    return model, transform, device


def extract_virchow2_features(
    patches,
    model,
    transform,
    device
):

    image_tensor = torch.stack(
        [
            transform(patch)
            for patch in patches
        ]
    ).to(
        device,
        non_blocking=True
    )

    with torch.inference_mode():

        if device.type == "cuda":

            with torch.autocast(
                device_type="cuda",
                dtype=torch.float16
            ):

                output = model(
                    image_tensor
                )

        else:

            output = model(
                image_tensor
            )

        class_token = output[:, 0]

        patch_tokens = output[:, 5:]

        embeddings = torch.cat(
            [
                class_token,
                patch_tokens.mean(dim=1)
            ],
            dim=-1
        )

    # shape: [batch, 2560]

    return (
        embeddings
        .detach()
        .cpu()
        .half()
    )

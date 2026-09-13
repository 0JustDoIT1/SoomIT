import numpy as np
import torch
import torch.nn as nn

from .AMD_Layer import AMD_Layer


def initialize_weights(module):
    for layer in module.modules():
        if isinstance(layer, nn.Conv2d):
            nn.init.xavier_normal_(layer.weight)
            if layer.bias is not None:
                layer.bias.data.zero_()
        elif isinstance(layer, nn.Linear):
            nn.init.xavier_normal_(layer.weight)
            if layer.bias is not None:
                layer.bias.data.zero_()
        elif isinstance(layer, nn.LayerNorm):
            nn.init.constant_(layer.bias, 0)
            nn.init.constant_(layer.weight, 1.0)


class AMDLayer(nn.Module):
    def __init__(self, norm_layer=nn.LayerNorm, dim=512, agent_num=512):
        super().__init__()
        self.norm = norm_layer(dim)
        self.attn = AMD_Layer(dim=dim, agent_num=agent_num, heads=8)

    def forward(self, x, return_WSI_attn=False):
        forward_result = self.attn(self.norm(x), return_WSI_attn)
        result = {"amd_out": x + forward_result["amd_out"]}
        if return_WSI_attn:
            result["WSI_attn"] = forward_result["WSI_attn"]
        return result


class PPEG(nn.Module):
    def __init__(self, dim=512):
        super().__init__()
        self.proj = nn.Conv2d(dim, dim, 7, 1, 7 // 2, groups=dim)
        self.proj1 = nn.Conv2d(dim, dim, 5, 1, 5 // 2, groups=dim)
        self.proj2 = nn.Conv2d(dim, dim, 3, 1, 3 // 2, groups=dim)

    def forward(self, x, height, width):
        _, _, channels = x.shape
        cls_token, feat_token = x[:, 0], x[:, 1:]
        cnn_feat = feat_token.transpose(1, 2).view(-1, channels, height, width)
        x = self.proj(cnn_feat) + cnn_feat + self.proj1(cnn_feat) + self.proj2(cnn_feat)
        return torch.cat((cls_token.unsqueeze(1), x.flatten(2).transpose(1, 2)), dim=1)


class AMD_MIL(nn.Module):
    def __init__(self, num_classes, in_dim, embed_dim, dropout, act, agent_num=256):
        super().__init__()
        self.pos_layer = PPEG(dim=embed_dim)
        layers = [nn.Linear(in_dim, embed_dim), act]
        if dropout:
            layers.append(nn.Dropout(dropout))
        self._fc1 = nn.Sequential(*layers)
        self.cls_token = nn.Parameter(torch.randn(1, 1, embed_dim))
        nn.init.normal_(self.cls_token, std=1e-6)
        self.num_classes = num_classes
        self.amdlayer1 = AMDLayer(dim=embed_dim, agent_num=agent_num)
        self.amdlayer2 = AMDLayer(dim=embed_dim, agent_num=agent_num)
        self.norm = nn.LayerNorm(embed_dim)
        self._fc2 = nn.Linear(embed_dim, self.num_classes)
        self.apply(initialize_weights)

    def forward(self, x, return_WSI_attn=False, return_WSI_feature=False):
        result = {}
        patch_count = x.shape[1]
        h = self._fc1(x)
        height = width = int(np.ceil(np.sqrt(h.shape[1])))
        add_length = height * width - h.shape[1]
        h = torch.cat([h, h[:, :add_length, :]], dim=1)
        cls_tokens = self.cls_token.expand(h.shape[0], -1, -1).to(h.device)
        h = torch.cat((cls_tokens, h), dim=1)
        h = self.amdlayer1(h)["amd_out"]
        h = self.pos_layer(h, height, width)
        amd_result = self.amdlayer2(h, return_WSI_attn)
        h = self.norm(amd_result["amd_out"])[:, :1].squeeze(1)
        result["logits"] = self._fc2(h)
        if return_WSI_feature:
            result["WSI_feature"] = h
        if return_WSI_attn:
            result["WSI_attn"] = amd_result["WSI_attn"][:, :, 0, 1 : patch_count + 1].mean(1).transpose(0, 1)
        return result

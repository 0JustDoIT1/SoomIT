import torch
import torch.nn as nn
from einops import rearrange


class AMD_Layer(nn.Module):
    def __init__(self, dim, agent_num=256, heads=8):
        super().__init__()
        self.dim_head = dim // heads
        self.agent_num = agent_num
        self.denoise = nn.Linear(self.dim_head, self.dim_head)
        self.mask = nn.Linear(self.dim_head, self.dim_head)
        self.get_thresh = nn.Linear(dim, 1)
        self.heads = heads
        self.scale = self.dim_head**-0.5
        self.to_qkv = nn.Linear(dim, dim * 3, bias=False)
        self.agent = nn.Parameter(torch.randn(heads, agent_num, self.dim_head))

    def forward(self, x, return_WSI_attn=False):
        result = {}
        b, _, _, heads = *x.shape, self.heads
        q, k, v = self.to_qkv(x).chunk(3, dim=-1)
        q, k, v = map(
            lambda tensor: rearrange(tensor, "b n (h d) -> b h n d", h=heads),
            (q, k, v),
        )
        agent = self.agent.unsqueeze(0).expand(b, -1, -1, -1)
        q = torch.matmul(q, agent.transpose(-1, -2))
        k = torch.matmul(agent, k.transpose(-1, -2))
        softmax = nn.Softmax(dim=-1)
        q = softmax(q * self.scale)
        k = softmax(k)
        kv = torch.matmul(k, v)
        threshold = torch.sigmoid(self.get_thresh(kv.reshape(b, self.agent_num, -1)).squeeze().mean())
        denoise = torch.sigmoid(self.denoise(kv))
        mask = torch.sigmoid(self.mask(kv))
        difference = mask - threshold
        hard_mask = (difference > 0).float()
        mask = difference + (hard_mask - difference).detach()
        kv = softmax(kv * mask + denoise)
        output = torch.matmul(q, kv)
        result["amd_out"] = rearrange(output, "b h n d -> b n (h d)", h=heads)
        if return_WSI_attn:
            result["WSI_attn"] = torch.matmul(q, k)
        return result

from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .config import Settings
from .predictor import InvalidFeatureFile, PDL1Predictor


class Probabilities(BaseModel):
    model_config = ConfigDict(extra="forbid")

    class_0: float = Field(ge=0, le=1)
    class_1: float = Field(ge=0, le=1)
    class_2: float = Field(ge=0, le=1)


class PredictionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    main_index: str | int | None
    pdl1_image_id: str | int | None
    patch_count: int = Field(ge=1)
    predicted_class: int = Field(ge=0, le=2)
    predicted_tps_range: str
    predicted_tps_range_label: str
    confidence: float = Field(ge=0, le=1)
    probabilities: Probabilities


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.predictor = PDL1Predictor(
            resolved_settings.checkpoint_path,
            resolved_settings.mil_baseline_path,
            device=resolved_settings.device,
            max_patches=resolved_settings.max_patches,
        )
        yield

    app = FastAPI(title="PD-L1 Inference Service", version="1.0.0", lifespan=lifespan)

    @app.get("/health")
    def health(request: Request) -> dict[str, str]:
        predictor = request.app.state.predictor
        return {"status": "ok", "model": "loaded", "device": str(predictor.device)}

    @app.post("/v1/predict", response_model=PredictionResponse)
    def predict(
        request: Request,
        content: bytes = Body(default=b"", media_type="application/octet-stream"),
    ) -> dict:
        if not content:
            raise HTTPException(status_code=400, detail="빈 feature 파일입니다.")
        if len(content) > resolved_settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail="feature 파일 크기 제한을 초과했습니다.")
        try:
            return request.app.state.predictor.predict_bytes(content)
        except InvalidFeatureFile as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    return app


app = create_app()

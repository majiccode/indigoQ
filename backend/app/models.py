"""Pydantic models that describe the indigoQ workspace graph."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PortSide = Literal["top", "right", "bottom", "left"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Port(ApiModel):
    """A connection point expressed as a normalized position along one border side."""

    side: PortSide
    t: float = Field(ge=0.0, le=1.0)


class ContentEntry(ApiModel):
    """A piece of content dropped into a content-source workspace."""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    name: str = Field(min_length=1, max_length=255)
    mimeType: str = Field(min_length=1, max_length=120)
    size: int = Field(ge=0, le=100_000_000)
    dataUrl: str = Field(min_length=1)


class Workspace(ApiModel):
    """An isolated unit on the infinite canvas."""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    name: str = Field(min_length=1, max_length=80)
    x: float = Field(ge=-10_000_000, le=10_000_000)
    y: float = Field(ge=-10_000_000, le=10_000_000)
    width: float = Field(ge=80, le=20_000)
    height: float = Field(ge=60, le=20_000)
    type: str | None = Field(default=None, max_length=80)
    contents: list[ContentEntry] = Field(default_factory=list, max_length=1000)
    editor: EditorDocument | None = None
    tool: MathState | TableState | OllamaState | None = None


class Parameter(ApiModel):
    value: float = Field(allow_inf_nan=False)
    min: float = Field(allow_inf_nan=False)
    max: float = Field(allow_inf_nan=False)


class MathState(ApiModel):
    kind: Literal["math-lab"]
    expressions: str = Field(max_length=100_000)
    sourceId: str = ""
    parameters: dict[str, Parameter] = Field(default_factory=dict, max_length=100)
    bounds: tuple[float, float, float, float]
    xColumn: str = ""
    yColumn: str = ""

    @model_validator(mode="after")
    def validate_bounds(self) -> MathState:
        import math

        a, b, c, d = self.bounds
        if not all(math.isfinite(value) for value in self.bounds) or a >= b or c >= d:
            raise ValueError("Plot bounds must be finite and increasing")
        if any(parameter.min >= parameter.max for parameter in self.parameters.values()):
            raise ValueError("Parameter minimum must be below maximum")
        return self


class TableState(ApiModel):
    kind: Literal["data-table"]
    columns: list[str] = Field(max_length=100)
    rows: list[list[str]] = Field(max_length=10_000)

    @model_validator(mode="after")
    def validate_rows(self) -> TableState:
        if any(len(row) != len(self.columns) for row in self.rows):
            raise ValueError("Rows must match the column count")
        return self


class OllamaState(ApiModel):
    kind: Literal["ollama"]
    model: str = Field(max_length=255)
    prompt: str = Field(max_length=100_000)
    system: str = Field(max_length=100_000)
    temperature: float = Field(ge=0, le=2)
    jsonOutput: bool = False
    output: str = Field(default="", max_length=5_000_000)
    context: str = Field(default="", max_length=1_000_000)
    sourceIds: list[str] = Field(default_factory=list, max_length=500)


class GenerateRequest(ApiModel):
    model: str = Field(min_length=1, max_length=255)
    prompt: str = Field(min_length=1, max_length=1_200_000)
    system: str = Field(default="", max_length=100_000)
    temperature: float = Field(default=0.7, ge=0, le=2)
    jsonOutput: bool = False


class EditorDocument(ApiModel):
    text: str = Field(default="", max_length=5_000_000)
    name: str = Field(default="untitled.txt", min_length=1, max_length=255)
    sourceWorkspaceId: str | None = None
    sourceFileId: str | None = None


class WorkspaceTypeRequest(ApiModel):
    type: Literal["content-source", "text-editor", "math-lab", "data-table", "ollama"]


class OpenDocumentRequest(ApiModel):
    workspaceId: str
    fileId: str


class SaveDocumentRequest(ApiModel):
    workspaceId: str
    name: str = Field(min_length=1, max_length=255)
    text: str = Field(max_length=5_000_000)
    fileId: str | None = None


class Wire(ApiModel):
    """A directed dataflow connection between two workspaces."""

    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")
    source: str = Field(min_length=1, max_length=64)
    sourcePort: Port
    target: str = Field(min_length=1, max_length=64)
    targetPort: Port


class Graph(ApiModel):
    """The complete canvas graph."""

    workspaces: list[Workspace] = Field(default_factory=list, max_length=500)
    wires: list[Wire] = Field(default_factory=list, max_length=2_000)

    @model_validator(mode="after")
    def _validate_references(self) -> Graph:
        workspace_ids = [workspace.id for workspace in self.workspaces]
        if len(workspace_ids) != len(set(workspace_ids)):
            raise ValueError("workspace ids must be unique")

        known = set(workspace_ids)
        wire_ids: set[str] = set()
        for wire in self.wires:
            if wire.id in wire_ids:
                raise ValueError(f"duplicate wire id: {wire.id}")
            wire_ids.add(wire.id)
            if wire.source not in known:
                raise ValueError(f"wire {wire.id} references unknown source {wire.source}")
            if wire.target not in known:
                raise ValueError(f"wire {wire.id} references unknown target {wire.target}")
            if wire.source == wire.target:
                raise ValueError(f"wire {wire.id} cannot connect a workspace to itself")
        return self


class GraphSnapshot(Graph):
    """A graph plus the time it was last persisted."""

    updatedAt: str | None = None

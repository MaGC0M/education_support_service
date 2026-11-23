from pydantic import BaseModel, field_validator, ConfigDict


class TicketCreate(BaseModel):
    title: str
    description: str
    author: str

    @field_validator("title")
    @classmethod
    def validate_title(cls, title):
        title = title.strip()
        if title == "":
            raise ValueError("Title cannot be empty")

        return title

    @field_validator("description")
    @classmethod
    def validate_description(cls, description):
        description = description.strip()
        if description == "":
            raise ValueError("Description cannot be empty")

        return description

    @field_validator("author")
    @classmethod
    def validate_author(cls, author):
        author = author.strip()
        if author == "":
            raise ValueError("Author cannot be empty")

        return author


class AssignOperator(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, name):
        name = name.strip()
        if name == "":
            raise ValueError("Name cannot be empty")

        return name


class TicketStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, status):
        good_statuses = ["in_progress", "closed"]
        if status not in good_statuses:
            raise ValueError("Status must be one of {}".format(good_statuses))

        return status


class CommentCreate(BaseModel):
    author: str
    text: str

    @field_validator("author")
    @classmethod
    def validate_author(cls, author):
        author = author.strip()
        if author == "":
            raise ValueError("Author cannot be empty")

        return author

    @field_validator("text")
    @classmethod
    def validate_text(cls, text):
        text = text.strip()
        if text == "":
            raise ValueError("Text cannot be empty")

        return text


class CommentRead(BaseModel):
    author: str
    text: str


class TicketRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    description: str
    author: str
    operator: str | None
    status: str
    comments: list[CommentRead]

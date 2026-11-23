from fastapi import FastAPI, HTTPException, Depends
from service import TicketService
from schemas import *
from domain import Ticket

app = FastAPI()
service = TicketService()


@app.post("/tickets", status_code=201, response_model=TicketRead)
def add_ticket(data: TicketCreate):
    title = data.title
    description = data.description
    author = data.author

    ticket = service.create_ticket(title, description, author)

    return ticket


@app.get("/tickets", response_model=list[TicketRead])
def get_tickets(status: str | None = None):
    tickets = service.list_tickets(status)

    return tickets


@app.get("/tickets/{ticket_id}", response_model=TicketRead)
def get_ticket(ticket_id: int):
    founded = service.get_ticket(ticket_id)

    if founded is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return founded


@app.patch("/tickets/{ticket_id}/assignee", response_model=TicketRead)
def assign_ticket(data: AssignOperator, ticket: Ticket = Depends(get_ticket)):
    name = data.name

    try:
        ticket.assign_operator(name)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

    return ticket


@app.patch("/tickets/{ticket_id}/status", response_model=TicketRead)
def update_status(data: TicketStatusUpdate, ticket: Ticket = Depends(get_ticket)):
    status = data.status

    try:
        if status == "in_progress":
            ticket.start()
        if status == "closed":
            ticket.close()
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

    return ticket


@app.post("/tickets/{ticket_id}/comments", response_model=CommentRead, status_code=201)
def create_comment(data: CommentCreate, ticket: Ticket = Depends(get_ticket)):
    author = data.author
    text = data.text

    try:
        result = ticket.add_comment(author, text)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

    return result


@app.delete("/tickets/{ticket_id}", status_code=204)
def delete_ticket(ticket_id: int, ticket: Ticket = Depends(get_ticket)):
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    try:
        service.delete_ticket(ticket_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))

    return ticket

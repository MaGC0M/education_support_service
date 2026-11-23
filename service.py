from domain import Ticket


class TicketService:
    def __init__(self):
        self.tickets = []
        self.next_id = 1

    def create_ticket(self, title, description, author):
        created_ticket = Ticket(self.next_id, title, description, author)

        self.next_id += 1
        self.tickets.append(created_ticket)

        return created_ticket

    def get_ticket(self, ticket_id):
        for ticket in self.tickets:
            if ticket.id == ticket_id:
                return ticket

        return None

    def list_tickets(self, status=None):
        statuses = ["new", "in_progress", "closed"]
        list_tickets = []

        if status is None:
            return self.tickets

        if status not in statuses:
            return []

        for ticket in self.tickets:
            if ticket.status == status:
                list_tickets.append(ticket)

        return list_tickets

    def delete_ticket(self, ticket_id):
        founded_ticket = self.get_ticket(ticket_id)

        if founded_ticket is None:
            raise ValueError("Ticket not found")
        if founded_ticket.status != "new":
            raise ValueError("Cannot delete ticket with status 'in_progress' or 'new'")

        self.tickets.remove(founded_ticket)
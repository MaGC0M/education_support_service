class Ticket:
    def __init__(self, id, title, description, author):
        self.id = id
        self.title = title
        self.description = description
        self.author = author
        self.status = "new"
        self.operator = None
        self.comments = []

    def assign_operator(self, name):
        if self.status != "new":
            raise ValueError("Ticket status must be 'new'")

        name = name.strip()

        if name == "":
            raise ValueError("Ticket name cannot be an empty string")

        self.operator = name

    def start(self):
        if self.status == "new" and self.operator is not None:
            self.status = "in_progress"
        else:
            raise ValueError("Ticket status must be 'new' with assigned operator")

    def add_comment(self, author, text):
        if self.status not in ["in_progress", "new"]:
            raise ValueError("Ticket status must be 'new' or 'in_progress'")

        author = author.strip()
        text = text.strip()

        if text == "":
            raise ValueError("Ticket text cannot be an empty string")
        if author == "":
            raise ValueError("Ticket author cannot be an empty string")

        dict_for_comment = {"author": author, "text": text}
        self.comments.append(dict_for_comment)

        return dict_for_comment

    def close(self):
        if self.status in ["closed", "new"]:
            raise ValueError("Ticket status must be 'in_progress'")

        if self.comments == []:
            raise ValueError("Ticket comments cannot be empty")

        self.status = "closed"
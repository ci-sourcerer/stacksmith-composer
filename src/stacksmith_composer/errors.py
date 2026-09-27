class ComposerError(Exception):
    """Represent a recoverable application error safe to display to a developer.

    Args:
        message: Public description of the failure.
        status: HTTP status code to return.
    """

    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status

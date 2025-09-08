from tkinter import *
import random
import pandas as pd

BACKGROUND_COLOR = "#B1DDC6"

try:
    data = pd.read_csv("words_to_learn.csv")
except FileNotFoundError:
    try:
        data = pd.read_csv("known_words.csv")  # if you have this as your starting file
    except FileNotFoundError:
        # fallback - typical file used in many tutorials; replace it with your actual file
        data = pd.read_csv("french_words.csv")
to_learn = data.to_dict(orient="records")

current_card = {}
flip = None

#Functions
def next_card():
    global current_card, flip, to_learn
    # cancel previously scheduled flip if any
    if flip is not None:
        try:
            window.after_cancel(flip)
        except Exception:
            pass

    if not to_learn:
        canvas.itemconfig(card_title, text="Done!", fill="black")
        canvas.itemconfig(card_words, text="You learned everything 🎉", fill="black")
        canvas.itemconfig(card_background, image=card_front)
        return

    current_card = random.choice(to_learn)
    canvas.itemconfig(card_title, text="French", fill="black")
    canvas.itemconfig(card_words, text=current_card["French"], fill="black")
    canvas.itemconfig(card_background, image=card_front)

    #flip after 3 seconds
    flip = window.after(3000, func=flip_card)

def flip_card():
    # show the English side
    canvas.itemconfig(card_title, text="English", fill="white")
    canvas.itemconfig(card_words, text=current_card["English"], fill="white")
    canvas.itemconfig(card_background, image=card_back)

def known_card():
    global to_learn
    try:
        to_learn.remove(current_card)
    except ValueError:
        pass

    # save remaining words to csv
    data_remaining = pd.DataFrame(to_learn)
    data_remaining.to_csv("words_to_learn.csv", index=False)
    next_card()

#UI setup
window = Tk()
window.title("Flash Card")
window.config(padx=50, pady=50, bg=BACKGROUND_COLOR)

# Canvas
canvas = Canvas(width=800, height=526, bg=BACKGROUND_COLOR, highlightthickness=0)
card_front = PhotoImage(file="card_front.png")
card_back = PhotoImage(file="card_back.png")
card_background = canvas.create_image(400, 263, image=card_front)

card_title = canvas.create_text(400, 150, text="", font=("Ariel", 40, "italic"))
card_words = canvas.create_text(400, 263, text="", font=("Ariel", 60, "bold"))

canvas.grid(row=0, column=0, columnspan=2)

# Buttons
wrong_img = PhotoImage(file="wrong.png")
right_img = PhotoImage(file="right.png")

wrong_button = Button(image=wrong_img, command=next_card)
wrong_button.grid(row=1, column=0)

right_button = Button(image=right_img, command=known_card)
right_button.grid(row=1, column=1)

# Start
next_card()
window.mainloop()

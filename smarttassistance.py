from flask import Flask, render_template, request
import pickle

app = Flask(__name__,static_folder='static')

# Load the models from Pickle files
with open("smarttt_alert_model.pkl", "rb") as f:
    alert_model = pickle.load(f)


@app.route("/")
def index():
    return render_template("index.html")

@app.route("/predict", methods=["POST"])
def predict():
    # Retrieve form data
    age = int(request.form["age"])
    
    trestbps = float(request.form["trestbps"])
    
    chol = float(request.form["chol"])
    
    thalch = float(request.form["thalch"])
    
    sex=int(request.form['sex'])
    if(sex=="male"):
            sex_Female=0
            sex_Male=1
    else:                            
            sex_Female=1
            sex_Male=0


    # Make predictions using the loaded models
    alert_prediction = alert_model.predict([[age,trestbps,chol,thalch,
                                             sex_Female,sex_Male]])[0]

    return render_template("index.html", alert=alert_prediction)

if __name__ == "__main__":
    app.run(debug=True)

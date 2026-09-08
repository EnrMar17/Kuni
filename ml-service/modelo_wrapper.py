"""
Módulo compartido: envoltorio del modelo calibrado.
Debe vivir en su propio archivo (no dentro de un script de entrenamiento)
para que joblib pueda cargarlo correctamente desde otros scripts/servicios.
"""
import numpy as np


class ModeloCalibrado:
    """Envuelve un modelo base (ej. GradientBoostingClassifier) + un
    calibrador (ej. IsotonicRegression) para que se comporte como un
    modelo normal de scikit-learn (mismo método predict_proba)."""

    def __init__(self, base, calibrador):
        self.base = base
        self.calibrador = calibrador

    def predict_proba(self, X):
        proba_cruda = self.base.predict_proba(X)[:, 1]
        proba_cal = self.calibrador.predict(proba_cruda)
        return np.column_stack([1 - proba_cal, proba_cal])

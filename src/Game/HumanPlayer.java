/**
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
*/

package Game;

import java.awt.event.KeyEvent;
import java.awt.event.KeyListener;

/**
 
 @author dowster
 */
public class HumanPlayer extends Player implements KeyListener
{
   private int keyDown = KeyEvent.CHAR_UNDEFINED;
   private int keyUp = KeyEvent.CHAR_UNDEFINED;
   
   private boolean keyDownPressed = false;
   private boolean keyUpPressed = false;
   
   /**
    * Creates a new HumanPlayer object
    * @param playerID the id to give the player (1 or 2)
    * @param keyDown the key that will correspond to paddle down movement
    * @param keyUp the key that will correspond to paddle up movement
    */
   public HumanPlayer(int playerID, int keyDown, int keyUp, Game game)
   {
      super(playerID);
      this.keyDown = keyDown;
      this.keyUp = keyUp;
      game.addKeyListener(this);
   }

   @Override
   public void keyTyped(KeyEvent ke)
   {
      
   }

   @Override
   public void keyPressed(KeyEvent ke)
   {
      if(ke.getKeyCode() == this.keyDown)
         keyDownPressed = true;
      if(ke.getKeyCode() == this.keyUp)
         keyUpPressed = true;
   }

   @Override
   public void keyReleased(KeyEvent ke)
   {
      if(ke.getKeyCode() == this.keyDown)
         keyDownPressed = false;
      if(ke.getKeyCode() == this.keyUp)
         keyUpPressed = false;
   }

   /**
    * Moves the paddle up or down based on what the player has pressed.
    * @param game the current game object, unused in HumanPlayer. 
    */
   @Override
   public void tick(Game game)
   {
      if(keyUpPressed)
         movePaddleUp();
      if(keyDownPressed)
         movePaddleDown();
   }
}
